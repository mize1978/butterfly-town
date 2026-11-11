# APIキーなしで動く。偽のクライアントで、予算の扱いと返答の形のチェックを確かめる
#   BUNDLE_GEMFILE=script/llm/Gemfile bundle exec ruby -Itest test/lib/llm_responder_test.rb
require "minitest/autorun"
require "tmpdir"
require "anthropic"
require_relative "../../lib/llm_responder"

class LlmResponderTest < Minitest::Test
  Usage = Struct.new(:input_tokens, :output_tokens, :cache_creation_input_tokens, :cache_read_input_tokens)
  Block = Struct.new(:type, :text)
  Message = Struct.new(:content, :stop_reason, :usage)

  # messages.count_tokens / messages.create だけを持つ偽物。呼ばれた回数と中身を記録する
  class FakeClient
    attr_reader :created, :counted

    def initialize(reply: nil, stop: :end_turn, raise_on_create: nil, input_tokens: 800)
      @reply, @stop, @raise, @input = reply, stop, raise_on_create, input_tokens
      @created, @counted = [], []
    end

    def messages = self

    def count_tokens(**params)
      @counted << params
      Struct.new(:input_tokens).new(@input)
    end

    def create(**params)
      @created << params
      raise @raise if @raise
      text = @reply.is_a?(String) ? @reply : JSON.generate(@reply)
      Message.new([Block.new(:thinking, nil), Block.new(:text, text)], @stop, Usage.new(700, 150, 0, 0))
    end
  end

  CONTEXT = {
    "resident_id" => "A", "scene" => "festival_prep", "step" => 0, "location" => "plaza",
    "personality" => ["約束を重視"], "goals" => ["祭りを成功させる"],
    "present" => %w[A B C], "locations" => %w[plaza shop home],
    "memories" => [{ "fact_key" => "e1", "content" => "Bは昨年の準備に参加しなかった",
                     "interpretation" => "Bは約束を軽く考えているのかもしれない", "source" => "observation" }]
  }.freeze

  def proposal(**over)
    { "actor" => "A", "action_type" => "invite", "target" => "B",
      "params" => { "task" => "setup", "fact_key" => nil, "about" => nil, "to" => nil },
      "reason" => "今年は一緒に準備したい" }.merge(over.transform_keys(&:to_s))
  end

  def setup
    @dir = Dir.mktmpdir
    @budget = LlmBudget.new(ledger_path: File.join(@dir, "l.jsonl"), cap_yen: 500, fx: 150)
  end

  def teardown = FileUtils.remove_entry(@dir)

  def run_with(client, budget: @budget) = LlmResponder.new(client:, budget:).call(CONTEXT)

  # --- 予算 ---

  def test_valid_reply_is_ok_and_settled_with_actual_usage
    r = run_with(FakeClient.new(reply: proposal))
    assert_equal "ok", r.status, r.errors.inspect
    assert_equal "B", r.proposal["target"]
    s = @budget.summary
    assert_equal [1, 0], [s[:calls], s[:unsettled]]
    assert_in_delta (700 * 0.10 + 150 * 0.50) / 1e6 * 150, s[:spent_yen], 1e-12
  end

  def test_does_not_call_when_worst_case_exceeds_remaining
    tiny = LlmBudget.new(ledger_path: File.join(@dir, "t.jsonl"), cap_yen: 0.01, fx: 150)
    client = FakeClient.new(reply: proposal)
    r = run_with(client, budget: tiny)
    assert_equal "over_budget", r.status
    assert_empty client.created, "上限を超えるなら create を呼ばない"
    assert_equal 0, tiny.summary[:calls]
  end

  def test_reservation_uses_counted_input_and_max_tokens
    run_with(FakeClient.new(reply: proposal, input_tokens: 1_000))
    reserve = File.readlines(File.join(@dir, "l.jsonl")).map { JSON.parse(_1) }.find { _1["kind"] == "reserve" }
    assert_equal [1_000, 2048], reserve.values_at("input_tokens_estimate", "max_tokens")
  end

  def test_api_error_leaves_reservation_unsettled
    err = Anthropic::Errors::APITimeoutError.new(url: URI("https://api.anthropic.com/v1/messages"))
    r = run_with(FakeClient.new(raise_on_create: err))
    assert_equal "error", r.status
    assert_equal 1, @budget.summary[:unsettled], "課金されたか分からないので予約額のまま数える"
    assert_operator @budget.spent_yen, :>, 0
  end

  def test_request_has_no_retries_hidden_inside_and_uses_structured_output
    client = FakeClient.new(reply: proposal)
    run_with(client)
    req = client.created.first
    assert_equal "claude-haiku-5-5", req[:model]
    assert_equal :json_schema, req.dig(:output_config, :format, :type)
    assert_equal %w[B C], req.dig(:output_config, :format, :schema, :properties, :target, :anyOf, 0, :enum)
    refute_includes req[:messages].first[:content], "Bは急な家族の用事", "本人が知らない事実は入力に入らない"
  end

  # --- 返答の形（形が合わなければ不成立） ---

  def test_unparseable_text_is_invalid_but_still_settled
    r = run_with(FakeClient.new(reply: "参加を誘います"))
    assert_equal "invalid", r.status
    assert_equal 0, @budget.summary[:unsettled]
  end

  def test_refusal_and_truncation_are_not_accepted
    assert_equal "refused", run_with(FakeClient.new(reply: proposal, stop: :refusal)).status
    assert_equal "truncated", run_with(FakeClient.new(reply: "{\"actor\":", stop: :max_tokens)).status
  end

  def test_wrong_actor_or_absent_target_is_invalid
    assert_includes LlmResponder.validate(CONTEXT, proposal(actor: "B")), "actor が本人ではない"
    assert_includes LlmResponder.validate(CONTEXT, proposal(target: "D")), "target がその場にいる相手ではない"
    assert_includes LlmResponder.validate(CONTEXT, proposal(target: "A")), "target がその場にいる相手ではない"
  end

  def test_telling_a_fact_not_in_own_memory_is_invalid
    tell = proposal(action_type: "tell", target: "C", params: { "task" => nil, "fact_key" => "e2", "about" => nil, "to" => nil })
    assert_includes LlmResponder.validate(CONTEXT, tell), "本人の記憶にない fact_key を話そうとした"
    ok = proposal(action_type: "tell", target: "C", params: { "task" => nil, "fact_key" => "e1", "about" => nil, "to" => nil })
    assert_empty LlmResponder.validate(CONTEXT, ok)
  end

  def test_extra_or_missing_fields_and_bad_reason_are_invalid
    assert(LlmResponder.validate(CONTEXT, proposal.merge("mood" => "happy")).any? { _1.start_with?("項目が違う") })
    assert(LlmResponder.validate(CONTEXT, proposal.except("reason")).any? { _1.start_with?("項目が違う") })
    assert_includes LlmResponder.validate(CONTEXT, proposal(reason: "あ" * 201)), "reason が空か長すぎる"
    assert_includes LlmResponder.validate(CONTEXT, proposal(action_type: "fly")), "知らない行動：\"fly\""
  end

  def test_action_specific_params
    work_with_target = proposal(action_type: "work", target: "B")
    assert_includes LlmResponder.validate(CONTEXT, work_with_target), "target は null のはず"
    move = proposal(action_type: "move", target: nil, params: { "task" => nil, "fact_key" => nil, "about" => nil, "to" => "moon" })
    assert_includes LlmResponder.validate(CONTEXT, move), "params.to が知らない場所"
    routine = proposal(action_type: "continue_routine", target: nil, params: { "task" => nil, "fact_key" => nil, "about" => nil, "to" => nil })
    assert_empty LlmResponder.validate(CONTEXT, routine)
  end
end
