require "test_helper"

# 検証①：同じ場面で記憶条件だけを変えると、固定応答の行動案が変わる。
# 固定応答の分岐検証であり、実LLMの自律判断を確認するものではない。
class FixedResponderTest < ActiveSupport::TestCase
  LOCATIONS = {"A" => "plaza", "B" => "plaza", "C" => "plaza"}.freeze

  setup do
    @responder = FixedResponder.from_file
  end

  def propose_for_a(memory_ids)
    run = SpikeScenario.load(locations: LOCATIONS, memory_ids: memory_ids)
    @responder.call(ResidentContext.build(run, "A", scene: "festival_prep"))
  end

  test "same scene with different memories of A yields different actions" do
    without_memory = propose_for_a(%w[m2 m3])
    with_absence = propose_for_a(%w[m1 m2 m3])

    assert_equal "continue_routine", without_memory["action_type"]
    assert_equal "consult", with_absence["action_type"]
    assert_equal "C", with_absence["target"]
  end

  test "knowing the reason for the absence changes the action to inviting B" do
    base = ResidentContext.build(SpikeScenario.load(locations: LOCATIONS), "A", scene: "festival_prep")
    informed = base.merge("memories" => base["memories"] + [{"fact_key" => "e2", "content" => "x", "interpretation" => nil, "source" => "told"}])

    assert_equal "consult", @responder.call(base)["action_type"]
    proposal = @responder.call(informed)
    assert_equal({"action_type" => "invite", "target" => "B", "params" => {"task" => "setup"}},
      proposal.slice("action_type", "target", "params"))
  end

  test "proposal carries actor, action type, target, params and the rule used" do
    proposal = propose_for_a(%w[m1])
    assert_equal %w[action_type actor params rule_id target], proposal.keys.sort
    assert_equal "A", proposal["actor"]
    assert_equal "A_knows_absence_only", proposal["rule_id"]
  end

  test "responder fails explicitly when no rule matches" do
    context = {"resident_id" => "B", "scene" => "festival_prep", "memories" => []}
    assert_raises(FixedResponder::NoMatchingResponse) { @responder.call(context) }
  end
end
