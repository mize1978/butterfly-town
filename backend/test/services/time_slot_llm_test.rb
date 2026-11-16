require "test_helper"

# #30 実LLM をつなぐときの時間帯の処理。
# - API を待つ間（数える・呼ぶ）は、DB のトランザクション（ロック）を持たない
# - AI を呼ぶ前に止まった／API が受け付けなかった（課金されていない）ときは、「応答を確かめられなかった」ではなく
#   ai_unavailable で止める（#30 のコメント 1.）。結果が分からないときだけ unknown_result
class TimeSlotLlmTest < ActiveSupport::TestCase
  MODEL = "claude-haiku-5-5"

  # 実LLM の代わり。数える・呼ぶの間に開いているトランザクションの数を記録する
  class Responder
    attr_reader :seen, :calls

    def initialize(model: MODEL, input_tokens: 2000, estimate_error: nil, &on_call)
      @model, @input, @estimate_error, @on_call, @seen, @calls = model, input_tokens, estimate_error, on_call, [], 0
    end

    def billable? = true
    attr_reader :model

    def estimate(_context)
      @seen << ActiveRecord::Base.connection.open_transactions
      raise @estimate_error if @estimate_error

      [ @input, 300 ]
    end

    def call_billed(context)
      @calls += 1
      @seen << ActiveRecord::Base.connection.open_transactions
      @on_call&.call
      [ FixedResponder.default.call(context), { "input_tokens" => 1387, "output_tokens" => 235 } ]
    end
  end

  setup do
    guest, = Guest.issue!
    @pt, = Playthrough.start_for!(guest)
    TimeSlotProcessor.new(@pt).call(time_index: 0) # 朝は誰も会わない
    @outside = ActiveRecord::Base.connection.open_transactions # テストそのもののトランザクションの分
  end

  def confirm(responder) = TimeSlotProcessor.new(@pt, responder: responder).call(time_index: 1)
  def slot_run = TimeSlotRun.find_by!(playthrough: @pt, time_index: 1)

  test "API を待つ間（トークンを数える・呼ぶ）は、トランザクションの外にいる（街の行も月の予算の行もロックしていない）" do
    responder = Responder.new
    assert_equal :confirmed, confirm(responder).status
    assert_equal 4, responder.seen.size
    assert_equal [ @outside ] * 4, responder.seen
  end

  test "プロンプトが長すぎて呼ばなかったときは ai_unavailable で止める。予約も費用も無い" do
    responder = Responder.new(input_tokens: 100_001)
    result = confirm(responder)
    assert_equal [ :suspended, "ai_unavailable" ], [ result.status, result.error ]
    assert_equal %w[suspended ai_unavailable], slot_run.values_at(:status, :suspend_reason)
    assert_equal 0, responder.calls
    assert_equal 0, AiCall.count
  end

  test "単価の分からないモデルでも、呼ぶ前なので ai_unavailable で止める" do
    result = confirm(Responder.new(model: "claude-unknown"))
    assert_equal [ :suspended, "ai_unavailable" ], [ result.status, result.error ]
    assert_equal 0, AiCall.count
  end

  test "トークン数を数えられなかったときも、呼ぶ前なので ai_unavailable で止める" do
    result = confirm(Responder.new(estimate_error: LlmResponder::Unavailable.new("count_tokens に失敗")))
    assert_equal [ :suspended, "ai_unavailable" ], [ result.status, result.error ]
    assert_equal 0, AiCall.count
  end

  test "API が受け付けなかった（課金されていない）ときは ai_unavailable で止め、予約を外して0円にする" do
    result = confirm(Responder.new { raise AiBudget::NotBilled, "429" })
    assert_equal [ :suspended, "ai_unavailable" ], [ result.status, result.error ]
    assert_equal [ [ "failed", 0, "discarded" ] ], AiCall.all.map { _1.values_at(:status, :actual_cost_micro_yen, :applied) }
    assert_equal [ 0, 0 ], AiBudget.default.month!.values_at(:reserved_micro_yen, :spent_micro_yen)
  end

  test "結果が分からない（タイムアウトなど）ときは、これまでどおり unknown_result" do
    result = confirm(Responder.new { raise Timeout::Error })
    assert_equal [ :suspended, "unknown_result" ], [ result.status, result.error ]
  end
end
