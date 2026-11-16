require "test_helper"

# #10 時間帯の処理と AI 予算。費用のかかる応答（実LLM の代わりの試験用）は呼ぶ前に予約し、
# 予算が足りなければ時間帯を確定させずに止める。Rails が住民の代わりに判断することはしない
class TimeSlotBudgetTest < ActiveSupport::TestCase
  MODEL = "claude-haiku-5-5"
  USAGE = { "input_tokens" => 1387, "output_tokens" => 235 }.freeze # 技術試作の実測。1回 38,430（100万分の1円）

  # 費用のかかる応答の試験用。中身は決まった応答と同じで、使用量だけを返す
  class BilledResponder
    attr_reader :calls

    def initialize(&fail) = (@fail, @calls = fail, 0)
    def billable? = true
    def model = MODEL
    def estimate(_context) = [ 2000, 300 ] # 最大額 52,500
    def call_billed(context)
      @calls += 1
      @fail&.call(@calls)
      [ FixedResponder.default.call(context), USAGE ]
    end
  end

  setup do
    guest, = Guest.issue!
    @pt, = Playthrough.start_for!(guest)
    @budget = AiBudget.default
    TimeSlotProcessor.new(@pt).call(time_index: 0) # 朝は誰も会わない
  end

  def confirm(responder, time_index = 1) = TimeSlotProcessor.new(@pt, responder: responder).call(time_index: time_index)
  def month = @budget.month!

  test "費用のかかる応答は、判断する住民ごとに予約して精算し、反映した呼び出しとして残る" do
    result = confirm(BilledResponder.new)
    assert_equal :confirmed, result.status
    calls = AiCall.order(:id)
    assert_equal [ [ "decision", "succeeded", "applied", 1, 1 ] ] * 2, calls.map { _1.values_at(:purpose, :status, :applied, :attempt, :base_time_index) }
    assert_equal [ @pt.id ], calls.map(&:playthrough_id).uniq
    assert_equal [ @pt.guest_id ], calls.map(&:guest_id).uniq
    assert_equal [ 0, 2 * 38_430 ], [ month.reserved_micro_yen, month.spent_micro_yen ]
  end

  test "決まった応答（費用なし）は予算を通さない" do
    assert_equal :confirmed, confirm(FixedResponder.default).status
    assert_equal 0, AiCall.count
  end

  test "予算が足りなければ AI を呼ばず、時間帯を確定させずに止め、再開できる時期を返す" do
    month.update_columns(spent_micro_yen: month.limit_micro_yen - 52_499)
    responder = BilledResponder.new
    version = @pt.reload.state_version
    result = confirm(responder)
    assert_equal [ :suspended, "budget" ], [ result.status, result.error ]
    assert_equal Time.current.in_time_zone("Asia/Tokyo").next_month.beginning_of_month, result.resume_at
    assert_equal 0, responder.calls, "Rails が代わりに判断することもしない"
    run = TimeSlotRun.find_by!(playthrough: @pt, time_index: 1)
    assert_equal %w[suspended budget], run.values_at(:status, :suspend_reason)
    @pt.reload
    assert_equal [ 1, version ], [ @pt.time_index, @pt.state_version ], "時間帯は進めず、状態も変えない"
    assert_empty @pt.world_events.where(time_index: 1)
    assert_equal 0, AiCall.count
  end

  test "途中で予算が尽きたら、それまでの呼び出しの費用は数えたまま反映しない。翌月にやり直すと attempt 2 で確定する" do
    month.update_columns(spent_micro_yen: month.limit_micro_yen - 52_500) # 1回分だけ残す
    result = confirm(BilledResponder.new)
    assert_equal :suspended, result.status
    first = AiCall.sole
    assert_equal [ "succeeded", "discarded", 1 ], first.values_at(:status, :applied, :attempt)
    assert_equal month.limit_micro_yen - 52_500 + 38_430, month.spent_micro_yen
    assert_empty @pt.world_events.where(time_index: 1)

    travel_to(Time.current.in_time_zone("Asia/Tokyo").next_month.beginning_of_month + 1.hour) do
      result = confirm(BilledResponder.new)
      assert_equal :confirmed, result.status
      assert_equal [ "confirmed", 2 ], TimeSlotRun.find_by!(playthrough: @pt, time_index: 1).values_at(:status, :attempt)
      assert_equal [ [ 2, "applied" ] ] * 2, AiCall.where.not(id: first.id).map { _1.values_at(:attempt, :applied) }
      assert_equal 2, @pt.world_events.where(time_index: 1).count
    end
  end

  test "結果が分からない呼び出しは予約額の全額を数え、自動では呼び直さずに止める" do
    responder = BilledResponder.new { raise Timeout::Error }
    result = confirm(responder)
    assert_equal [ :suspended, "unknown_result" ], [ result.status, result.error ]
    assert_equal 1, responder.calls
    assert_equal [ [ "unknown", "discarded", 52_500 ] ], AiCall.all.map { _1.values_at(:status, :applied, :actual_cost_micro_yen) }
    assert_equal 1, @pt.reload.time_index
  end

  test "判断の間に状態が変わって反映しなかった呼び出しも、費用は数えたまま反映しない印をつける" do
    responder = BilledResponder.new { Playthrough.where(id: @pt.id).update_all("state_version = state_version + 1") }
    assert_equal :suspended, confirm(responder).status
    assert_equal %w[discarded discarded], AiCall.pluck(:applied)
    assert_equal 2 * 38_430, month.spent_micro_yen
  end
end
