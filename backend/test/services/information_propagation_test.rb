require "test_helper"

# 検証②：CがAへ情報を伝えたとき、成立した伝達だけがAの記憶に反映される。
class InformationPropagationTest < ActiveSupport::TestCase
  SECRET = "Bは急な家族の用事で準備に参加できなかった"

  setup do
    @run = SpikeScenario.load(locations: {"A" => "plaza", "B" => "plaza", "C" => "plaza"})
    @processor = FixedActionProcessor.new(@run)
    @responder = FixedResponder.from_file
  end

  def context(resident)
    ResidentContext.build(@run.reload, resident, scene: "festival_prep")
  end

  def tell(actor, target, id: "tell", fact_key: "e2")
    {command_id: id, kind: "told", actor: actor, target: target, task: nil, fact_key: fact_key, step: 0, cause_id: nil}
  end

  def reject_without_change(input)
    before = [@run.confirmed_events.count, @run.memories.order(:id).pluck(:id), @run.reload.progress]
    assert_raises(FixedActionProcessor::InvalidAction) { @processor.call(input) }
    assert_equal before, [@run.confirmed_events.count, @run.memories.order(:id).pluck(:id), @run.reload.progress]
  end

  test "before being told, A's context does not contain the secret" do
    a = context("A")
    assert_equal %w[e1], a["memories"].map { |m| m["fact_key"] }
    assert_not_includes a.to_json, SECRET
    assert_includes context("C").to_json, SECRET
  end

  test "A cannot pass on the secret before learning it" do
    # 受け手Bが秘密を知らない条件にして、「受け手が既に知っている」ではなく「Aが知らない」ことで拒否されるようにする
    @run = SpikeScenario.load(locations: {"A" => "plaza", "B" => "plaza", "C" => "plaza"}, memory_ids: %w[m1 m3])
    @processor = FixedActionProcessor.new(@run)
    reject_without_change(tell("A", "B", fact_key: "e2"))
  end

  test "a confirmed tell from C creates A's memory linked to the event" do
    proposal = @responder.call(context("C"))
    event = @processor.call(FixedActionProcessor.command_from(proposal, command_id: "c-tells-a", step: 0))

    memory = @run.memories.find_by!(owner: "A", fact_key: "e2")
    assert_equal "told", event.kind
    assert_equal "told", memory.source
    assert_equal event, memory.source_event
    assert_equal 0, memory.acquired_step
    assert_equal @run.memories.find_by!(owner: "C", fact_key: "e2").content, memory.content
    assert_includes context("A").to_json, SECRET
    assert_equal 0, @run.reload.progress
  end

  test "a memory acquired at a later step is neither in the context nor tellable yet" do
    run = SpikeScenario.load(locations: {"A" => "plaza", "B" => "plaza", "C" => "plaza"}, memory_ids: %w[m1])
    run.memories.create!(owner: "C", fact_key: "e2", content: SECRET, source: "B", acquired_step: 1)
    assert_not_includes ResidentContext.build(run, "C", scene: "festival_prep").to_json, SECRET
    @run, @processor = run, FixedActionProcessor.new(run)
    reject_without_change(tell("C", "A"))

    run.update!(step: 1)
    assert_includes ResidentContext.build(run, "C", scene: "festival_prep").to_json, SECRET
    @processor.call(tell("C", "A").merge(step: 1))
    assert run.memories.exists?(owner: "A", fact_key: "e2", acquired_step: 1)
  end

  test "tell is rejected when the residents are in different places" do
    @run.update!(locations: {"A" => "plaza", "B" => "plaza", "C" => "shop"})
    reject_without_change(tell("C", "A"))
  end

  test "tell is rejected for unknown, missing or self targets and unknown facts" do
    reject_without_change(tell("C", "C"))
    reject_without_change(tell("C", "D"))
    reject_without_change(tell("C", nil))
    reject_without_change(tell("C", "A", fact_key: "e9"))
    reject_without_change(tell("C", "A").merge(task: "setup"))
  end

  test "repeating a tell does not duplicate the memory; a new id for the same fact is rejected" do
    input = tell("C", "A")
    first = @processor.call(input)
    assert_equal first.id, @processor.call(input).id
    assert_equal 1, @run.memories.where(owner: "A", fact_key: "e2").count
    reject_without_change(tell("C", "A", id: "tell-again"))
  end

  test "tell is rolled back when the memory cannot be stored" do
    @run.memories.create!(owner: "A", fact_key: "e2", content: "既存", source: "observation", acquired_step: 0)
    @processor.define_singleton_method(:validate_tell!) { |*| nil }
    before = @run.confirmed_events.count
    assert_raises(ActiveRecord::RecordNotUnique) { @processor.call(tell("C", "A")) }
    assert_equal before, @run.confirmed_events.count
  end

  test "after the tell, A's proposal changes and the chain advances preparation only on work" do
    assert_equal "consult", @responder.call(context("A"))["action_type"]
    @processor.call(FixedActionProcessor.command_from(@responder.call(context("C")), command_id: "c-tells-a", step: 0))

    proposal = @responder.call(context("A"))
    assert_equal "invite", proposal["action_type"]
    invitation = @processor.call(FixedActionProcessor.command_from(proposal, command_id: "a-invites-b", step: 0))
    assert_equal 0, @run.reload.progress
    acceptance = @processor.call(command_id: "b-accepts", kind: "accepted", actor: "B", target: "A",
      task: "setup", step: 0, cause_id: invitation.id)
    assert_equal 0, @run.reload.progress
    @processor.call(command_id: "b-works", kind: "worked", actor: "B", target: nil,
      task: "setup", step: 0, cause_id: acceptance.id)
    assert_equal 1, @run.reload.progress
  end

  test "proposals that Rails does not support are rejected before reaching the world" do
    proposal = @responder.call(context("A"))
    assert_equal "consult", proposal["action_type"]
    assert_raises(FixedActionProcessor::InvalidAction) do
      FixedActionProcessor.command_from(proposal, command_id: "consult", step: 0)
    end
  end
end
