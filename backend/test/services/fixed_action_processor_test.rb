require "test_helper"

class FixedActionProcessorTest < ActiveSupport::TestCase
  setup do
    @run = SpikeScenario.load(locations: {"A" => "plaza", "B" => "plaza", "C" => "plaza"})
    @processor = FixedActionProcessor.new(@run)
  end

  def command(kind, actor, target: nil, cause_id: nil, id: kind)
    {command_id: id, kind: kind, actor: actor, target: target, task: "setup", step: 0, cause_id: cause_id}
  end

  def invite
    @processor.call(command("invited", "A", target: "B"))
  end

  def accept(invitation)
    @processor.call(command("accepted", "B", target: "A", cause_id: invitation.id))
  end

  def reject_without_change(input)
    before = [@run.confirmed_events.count, @run.memories.count, @run.reload.progress]
    assert_raises(FixedActionProcessor::InvalidAction) { @processor.call(input) }
    assert_equal before, [@run.confirmed_events.count, @run.memories.count, @run.reload.progress]
  end

  test "invitation acceptance and work persist separately; only work advances preparation" do
    invitation = invite
    assert_equal 0, @run.reload.progress
    acceptance = accept(invitation)
    assert_equal 0, @run.reload.progress
    work = @processor.call(command("worked", "B", cause_id: acceptance.id))
    assert_equal 1, @run.reload.progress
    assert_equal %w[invited accepted worked], @run.confirmed_events.order(:id).pluck(:kind)
    assert_equal invitation.id, acceptance.reload.cause_id
    assert_equal acceptance.id, work.reload.cause_id
    assert_equal 1, SimulationRun.find(@run.id).progress
  end

  test "work without acceptance is rejected" do
    invitation = invite
    reject_without_change(command("worked", "B", cause_id: invitation.id))
  end

  test "C cannot accept invitation addressed to B" do
    reject_without_change(command("accepted", "C", target: "A", cause_id: invite.id))
  end

  test "declining prevents acceptance and work" do
    invitation = invite
    declined = @processor.call(command("declined", "B", target: "A", cause_id: invitation.id))
    reject_without_change(command("accepted", "B", target: "A", cause_id: invitation.id))
    reject_without_change(command("worked", "B", cause_id: declined.id))
  end

  test "repeating a command is idempotent but changing its content is rejected" do
    input = command("invited", "A", target: "B")
    first = @processor.call(input)
    assert_equal first.id, @processor.call(input).id
    assert_equal 1, @run.confirmed_events.count
    reject_without_change(input.merge(target: "C"))
  end

  test "work cannot be counted twice even with a new command id" do
    acceptance = accept(invite)
    input = command("worked", "B", cause_id: acceptance.id)
    @processor.call(input)
    @processor.call(input)
    assert_equal 1, @run.reload.progress
    reject_without_change(input.merge(command_id: "another-work"))
  end

  test "wrong location stale step and invented resident are rejected" do
    acceptance = accept(invite)
    @run.update!(locations: {"A" => "plaza", "B" => "shop", "C" => "plaza"})
    reject_without_change(command("worked", "B", cause_id: acceptance.id))
    reject_without_change(command("invited", "C", target: "A").merge(step: 1))
    reject_without_change(command("invited", "D", target: "A"))
  end

  test "causal events from a different run are rejected" do
    invitation = invite
    other = SimulationRun.create!(locations: @run.locations)
    assert_raises(FixedActionProcessor::InvalidAction) do
      FixedActionProcessor.new(other).call(command("accepted", "B", target: "A", cause_id: invitation.id))
    end
    assert_equal 0, other.confirmed_events.count
  end

  test "event insert rolls back when progress update fails" do
    acceptance = accept(invite)
    @run.define_singleton_method(:update!) { |*| raise "simulated storage failure" }
    before = @run.confirmed_events.count
    assert_raises(RuntimeError) { @processor.call(command("worked", "B", cause_id: acceptance.id)) }
    assert_equal before, @run.confirmed_events.count
    assert_equal 0, SimulationRun.find(@run.id).progress
  end
end
