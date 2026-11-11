# Rails を読み込まずに動く（ruby -Itest test/lib/llm_budget_test.rb）
require "minitest/autorun"
require "tmpdir"
require_relative "../../lib/llm_budget"

class LlmBudgetTest < Minitest::Test
  def setup
    @dir = Dir.mktmpdir
    @ledger = File.join(@dir, "ledger.jsonl")
  end

  def teardown = FileUtils.remove_entry(@dir)

  def budget(cap = 500) = LlmBudget.new(ledger_path: @ledger, cap_yen: cap, fx: 150)

  def test_worst_case_uses_official_haiku_5_5_prices
    # 入力2,000×$0.10/M ＋ 出力1,000×$0.50/M ＝ $0.0007 → 150円換算で0.105円
    assert_in_delta 0.105, budget.worst_case_yen(input_tokens: 2_000, max_tokens: 1_000), 1e-9
  end

  def test_actual_cost_comes_from_usage_including_cache
    usage = { "input_tokens" => 1_000, "output_tokens" => 200, "cache_creation_input_tokens" => 0, "cache_read_input_tokens" => 0 }
    assert_in_delta 0.03, budget.actual_yen(usage), 1e-9 # ($0.0001 + $0.0001) × 150
  end

  def test_reserve_refuses_when_worst_case_exceeds_remaining
    b = budget(0.2)
    b.reserve!(input_tokens: 2_000, max_tokens: 1_000) # 0.105円
    assert_raises(LlmBudget::OverBudget) { b.reserve!(input_tokens: 2_000, max_tokens: 1_000) }
    assert_equal 1, b.summary[:calls], "断った呼び出しは台帳に書かない"
  end

  def test_unsettled_reservation_counts_at_reserved_amount
    b = budget
    b.reserve!(input_tokens: 2_000, max_tokens: 1_000)
    assert_in_delta 0.105, b.spent_yen, 1e-9
    assert_equal 1, b.summary[:unsettled]
  end

  def test_settle_replaces_reservation_with_actual_cost
    b = budget
    id = b.reserve!(input_tokens: 2_000, max_tokens: 1_000)
    b.settle!(id, usage: { input_tokens: 1_000, output_tokens: 200 })
    assert_in_delta 0.03, b.spent_yen, 1e-9
    assert_equal 0, b.summary[:unsettled]
  end

  def test_settle_rejects_unknown_or_double_settlement
    b = budget
    assert_raises(ArgumentError) { b.settle!("nope", usage: {}) }
    id = b.reserve!(input_tokens: 10, max_tokens: 10)
    b.settle!(id, usage: { input_tokens: 10, output_tokens: 10 })
    assert_raises(ArgumentError) { b.settle!(id, usage: { input_tokens: 10, output_tokens: 10 }) }
  end

  def test_refuses_prompts_over_the_long_context_threshold
    assert_raises(LlmBudget::OverBudget) { budget.worst_case_yen(input_tokens: 100_001, max_tokens: 10) }
  end

  def test_rejects_unknown_model_and_non_positive_cap
    assert_raises(ArgumentError) { LlmBudget.new(ledger_path: @ledger, cap_yen: 500, model: "claude-unknown") }
    assert_raises(ArgumentError) { LlmBudget.new(ledger_path: @ledger, cap_yen: 0) }
  end

  def test_ledger_survives_a_new_instance
    budget.reserve!(input_tokens: 2_000, max_tokens: 1_000)
    assert_in_delta 0.105, budget.spent_yen, 1e-9
  end
end
