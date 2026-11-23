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

    # proposal：返す行動案を差し替える（context を受け取る）。指定がなければ決まった応答と同じ案を返す
    def initialize(model: MODEL, input_tokens: 2000, estimate_error: nil, proposal: nil, &on_call)
      @model, @input, @estimate_error, @proposal, @on_call, @seen, @calls = model, input_tokens, estimate_error, proposal, on_call, [], 0
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
      [ @proposal ? @proposal.call(context) : FixedResponder.default.call(context), { "input_tokens" => 1387, "output_tokens" => 235 } ]
    end
  end

  setup do
    @pt = start_playthrough
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

  test "実LLM の案が Rails の検証で却下されたときは、出来事にせず rejected に理由を返す。時間帯は確定して進み、利用記録は残る" do
    # その場にいない相手を誘う案（検証で「target がその場にいる相手ではない」になる）
    responder = Responder.new(proposal: ->(context) { { "actor" => context.fetch("resident_key"), "action_type" => "invite",
                                                        "target" => "nobody", "params" => { "task" => "setup" } } })
    result = confirm(responder)

    # 時間帯は確定して進む
    assert_equal :confirmed, result.status
    assert_equal "confirmed", slot_run.status
    assert_equal 2, @pt.reload.time_index
    # 却下された案の出来事は作られない
    assert_equal [], result.events
    assert_not @pt.world_events.where(time_index: 1, kind: "invited").exists?
    # rejected に理由が出る（判断した住民ごとに1件）
    assert_equal 2, responder.calls
    assert_equal 2, result.rejected.size
    result.rejected.each do |rejected|
      assert_equal "invite", rejected[:action_type]
      assert_includes rejected[:errors], "target がその場にいる相手ではない"
    end
    # 呼び出しの利用記録は残り、費用も数える（反映済みの扱い。採用か却下かは AiCall では区別しない）
    calls = AiCall.where(time_slot_run: slot_run).order(:id)
    assert_equal [ [ "decision", "succeeded", "applied", 1 ] ] * 2, calls.map { _1.values_at(:purpose, :status, :applied, :attempt) }
    assert calls.all? { _1.actual_cost_micro_yen.positive? }
    assert_equal calls.sum(:actual_cost_micro_yen), AiBudget.default.month!.spent_micro_yen
  end
end
