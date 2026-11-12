require "test_helper"

# #10 AI の月予算。呼ぶ前に最大額を予約し、応答後に実額で精算する。金額は「100万分の1円」の整数
class AiBudgetTest < ActiveSupport::TestCase
  MODEL = "claude-haiku-5-5"
  NOW = Time.utc(2026, 11, 20, 12)

  setup { @budget = AiBudget.default }

  def reserve(purpose: "dev", input_tokens: 2000, max_output_tokens: 300, now: NOW, **owner)
    @budget.reserve!(purpose:, model: MODEL, input_tokens:, max_output_tokens:, now:, **owner)
  end

  def month = AiBudgetMonth.find_by!(month: "2026-11")

  # DB が拒否することを確かめる（セーブポイントの中で試す）
  def assert_rejected(error, &block)
    assert_raises(error) { ActiveRecord::Base.transaction(requires_new: true, &block) }
  end

  # --- 金額の計算（README「10-4」・技術試作 #5 の台帳と同じ値になる） ---

  test "最大額は入力すべてと出力の上限で見積もる。README の試算（入力2,000・出力300）は約0.053円" do
    assert_equal 52_500, @budget.worst_case_micro_yen(model: MODEL, input_tokens: 2000, max_output_tokens: 300)
  end

  test "実額は応答の usage から計算する。技術試作の実測（入力1,387・出力235）は0.03843円で、試作の台帳と同じ" do
    assert_equal 38_430, @budget.actual_micro_yen(model: MODEL, usage: { input_tokens: 1387, output_tokens: 235 })
  end

  test "10万トークンを超えるプロンプトは単価が上がるので呼ばない。単価の分からないモデルも呼ばない" do
    assert_raises(AiBudget::PromptTooLong) { reserve(input_tokens: 100_001) }
    assert_raises(ArgumentError) { @budget.reserve!(purpose: "dev", model: "unknown", input_tokens: 1, max_output_tokens: 1, now: NOW) }
    assert_equal 0, AiCall.count
  end

  test "月の予算は3,000円、新しい呼び出しを止める額は2,000円（設定ファイル）" do
    assert_equal [ 3000, 2000 ], AiBudget.config.values_at("monthly_budget_yen", "stop_new_calls_at_yen")
    reserve
    assert_equal 2_000 * 1_000_000, month.limit_micro_yen
  end

  # --- 予約と精算 ---

  test "予約すると月の予約額が増え、呼び出しの記録ができる。精算すると予約を外し、実額を使った額に足す" do
    call = reserve
    assert_equal [ 52_500, 0 ], [ month.reserved_micro_yen, month.spent_micro_yen ]
    assert_equal [ "reserved", 52_500, "#{MODEL}@2026-11-11" ], [ call.status, call.reserved_cost_micro_yen, call.price_version ]

    @budget.settle!(call, model: MODEL, usage: { input_tokens: 1387, output_tokens: 235 })
    assert_equal [ 0, 38_430 ], [ month.reserved_micro_yen, month.spent_micro_yen ]
    assert_equal [ "succeeded", 38_430, 1387, 235 ], call.reload.values_at(:status, :actual_cost_micro_yen, :input_tokens, :output_tokens)

    @budget.settle!(call, model: MODEL, usage: { input_tokens: 1387, output_tokens: 235 })
    assert_equal 38_430, month.spent_micro_yen, "2回精算しても二重に数えない"
  end

  test "結果が分からない呼び出しは、予約額の全額を使ったものとして数える" do
    call = reserve
    @budget.unknown!(call)
    assert_equal [ 0, 52_500 ], [ month.reserved_micro_yen, month.spent_micro_yen ]
    assert_equal [ "unknown", 52_500 ], call.reload.values_at(:status, :actual_cost_micro_yen)
  end

  test "課金されていないと分かっている失敗だけ、予約を外して0円にする" do
    call = reserve
    @budget.failed!(call)
    assert_equal [ 0, 0 ], [ month.reserved_micro_yen, month.spent_micro_yen ]
    assert_equal "failed", call.reload.status
  end

  test "with_call：タイムアウトは結果が分からない呼び出しとして全額を数え、例外を投げ直す。自動では呼び直さない" do
    tries = 0
    assert_raises(Timeout::Error) do
      @budget.with_call(model: MODEL, purpose: "dev", input_tokens: 2000, max_output_tokens: 300, now: NOW) do
        tries += 1
        raise Timeout::Error
      end
    end
    assert_equal 1, tries
    assert_equal [ "unknown" ], AiCall.pluck(:status)
    assert_equal 52_500, month.spent_micro_yen
  end

  test "with_call：応答が返れば実額で精算し、結果を返す" do
    result = @budget.with_call(model: MODEL, purpose: "dev", input_tokens: 2000, max_output_tokens: 300, now: NOW) do
      [ :ok, { "input_tokens" => 1387, "output_tokens" => 235 } ]
    end
    assert_equal :ok, result
    assert_equal [ 0, 38_430 ], [ month.reserved_micro_yen, month.spent_micro_yen ]
  end

  # --- 上限 ---

  test "予約の合計と使った額に足して2,000円を超える呼び出しはしない。再開できる時期（翌月1日 UTC）を返し、何も記録しない" do
    reserve
    month.update_columns(spent_micro_yen: 2_000 * 1_000_000 - 52_500 - 52_499)
    error = assert_raises(AiBudget::Exhausted) { reserve }
    assert_equal Time.utc(2026, 12, 1), error.resume_at
    assert_equal 1, AiCall.count
    assert_equal 52_500, month.reserved_micro_yen

    month.update_columns(spent_micro_yen: month.spent_micro_yen - 1) # ちょうど上限までなら呼べる
    assert reserve
  end

  test "結果が分からない呼び出しの予約額も、上限の計算に入る" do
    month_left = ->(m) { m.limit_micro_yen - m.used_micro_yen }
    @budget.unknown!(reserve)
    assert_equal 2_000 * 1_000_000 - 52_500, month_left.(month)
  end

  test "月が変わると新しい月の行で数える（前の月の使った額は持ち越さない）" do
    reserve
    month.update_columns(spent_micro_yen: 2_000 * 1_000_000)
    assert_raises(AiBudget::Exhausted) { reserve }
    assert reserve(now: Time.utc(2026, 12, 1))
    assert_equal %w[2026-11 2026-12], AiBudgetMonth.order(:month).pluck(:month)
  end

  # --- ゲームの判断・会話・要約・再試行・開発検証は同じ予算 ---

  test "判断・会話・要約・再試行・開発検証のどれも、同じ月の行で数える" do
    guest, = Guest.issue!
    pt, = Playthrough.start_for!(guest)
    run = TimeSlotRun.create!(playthrough: pt, time_index: 0, status: "running", base_state_version: 0)
    reserve(purpose: "decision", playthrough: pt, guest: guest, time_slot_run: run, attempt: 1)
    reserve(purpose: "decision", playthrough: pt, guest: guest, time_slot_run: run, attempt: 2) # 再試行
    reserve(purpose: "conversation", playthrough: pt, guest: guest)
    reserve(purpose: "summary", playthrough: pt, guest: guest)
    reserve(purpose: "dev")
    assert_equal 1, AiBudgetMonth.count
    assert_equal 5 * 52_500, month.reserved_micro_yen
    assert_equal %w[conversation decision decision dev summary], AiCall.order(:purpose).pluck(:purpose)
    assert_raises(ArgumentError) { reserve(purpose: "other") }
  end

  # --- DB の制約 ---

  test "金額・用途・状態は DB でも守る" do
    call = reserve
    assert_rejected(ActiveRecord::CheckViolation) { call.update_columns(status: "unknown", actual_cost_micro_yen: 1) }
    assert_rejected(ActiveRecord::CheckViolation) { call.update_columns(status: "succeeded", actual_cost_micro_yen: nil) }
    assert_rejected(ActiveRecord::CheckViolation) { call.update_columns(purpose: "other") }
    assert_rejected(ActiveRecord::CheckViolation) { month.update_columns(reserved_micro_yen: -1) }
    assert_rejected(ActiveRecord::RecordNotUnique) { AiBudgetMonth.insert!({ month: "2026-11", limit_micro_yen: 1 }) }
  end

  test "返答待ちの会話は街に1つだけ" do
    guest, = Guest.issue!
    pt, = Playthrough.start_for!(guest)
    reserve(purpose: "conversation", playthrough: pt, guest: guest)
    assert_rejected(ActiveRecord::RecordNotUnique) { reserve(purpose: "conversation", playthrough: pt, guest: guest) }
  end
end
