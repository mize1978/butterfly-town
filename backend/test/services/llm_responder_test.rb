require "test_helper"

# #30 実LLM で住民が判断する。API キーなしで動く偽のクライアントで、呼び出しの中身・返答の受け取り方・
# 失敗の分け方（課金されていない／結果が分からない）を確かめる。実際の API は呼ばない
class LlmResponderTest < ActiveSupport::TestCase
  Usage = Struct.new(:input_tokens, :output_tokens, :cache_creation_input_tokens, :cache_read_input_tokens)
  Block = Struct.new(:type, :text)
  Message = Struct.new(:content, :stop_reason, :usage)

  # messages.count_tokens / messages.create だけを持つ偽物
  class FakeClient
    attr_reader :created, :counted

    def initialize(reply: nil, stop: :end_turn, raise_on_create: nil, raise_on_count: nil, input_tokens: 1387)
      @reply, @stop, @raise_create, @raise_count, @input = reply, stop, raise_on_create, raise_on_count, input_tokens
      @created, @counted = [], []
    end

    def messages = self

    def count_tokens(**params)
      @counted << params
      raise @raise_count if @raise_count
      Struct.new(:input_tokens).new(@input)
    end

    def create(**params)
      @created << params
      raise @raise_create if @raise_create
      text = @reply.is_a?(String) ? @reply : JSON.generate(@reply)
      Message.new([ Block.new(:text, text) ], @stop, Usage.new(1387, 235, 0, 0))
    end
  end

  CONTEXT = {
    "resident_key" => "a", "time_index" => 1, "part" => "noon", "location" => "plaza",
    "present" => %w[b c], "locations" => %w[plaza shop home],
    "personality" => [ "約束を重視" ], "goals" => [ "祭りを成功させる" ],
    "memories" => [ { "fact_key" => "e1", "content" => "Bは昨年の準備に参加しなかった",
                      "interpretation" => "Bは約束を軽く考えているのかもしれない", "source" => "observation" } ],
    "invites_to_me" => [], "my_invites" => [], "usual_places" => {}
  }.freeze

  def reply(**over)
    { "actor" => "a", "action_type" => "invite", "target" => "b",
      "params" => { "task" => "setup", "fact_key" => nil, "about" => nil, "to" => nil, "answer" => nil },
      "reason" => "今年は一緒に準備したい" }.merge(over.transform_keys(&:to_s))
  end

  def responder(client) = LlmResponder.new(client: client, config: LlmResponder.config)

  def status_error(status)
    Anthropic::Errors::APIStatusError.for(url: URI("https://api.anthropic.com/v1/messages"), status: status, headers: {},
                                          body: nil, request: nil, response: nil, message: "status #{status}")
  end

  test "費用のかかる応答として、モデルと最大額の見積もり（入力トークン数・出力の上限）を出す" do
    client = FakeClient.new
    r = responder(client)
    assert r.billable?
    assert_equal "claude-haiku-5-5", r.model
    assert_equal [ 1387, 1024 ], r.estimate(CONTEXT)
    assert_equal 1, client.counted.size
    assert_not client.counted.first.key?(:max_tokens), "数えるときは出力の上限を渡さない"
  end

  test "渡すのは本人の情報と記憶だけ。答えの形は JSON スキーマで縛り、actor は本人、target はその場にいる相手か null" do
    client = FakeClient.new(reply: reply)
    responder(client).call_billed(CONTEXT)
    req = client.created.first
    assert_equal [ "claude-haiku-5-5", 1024 ], req.values_at(:model, :max_tokens)
    text = req[:messages].first[:content]
    assert_includes text, "Bは昨年の準備に参加しなかった"
    assert_includes text, "約束を重視"
    schema = req.dig(:output_config, :format, :schema)
    assert_equal [ "a" ], schema.dig(:properties, :actor, :enum)
    assert_equal %w[b c], schema.dig(:properties, :target, :anyOf, 0, :enum)
    assert_equal ProposalValidator::ACTIONS, schema.dig(:properties, :action_type, :enum)
  end

  test "#55：誘い・自分の誘いの結果・いつもの居場所を渡し、返事の相手として離れた誘い主も選べる。受けた誘いは渡さない" do
    context = CONTEXT.merge(
      "resident_key" => "b", "present" => [], "memories" => [],
      "invites_to_me" => [ { "from" => "a", "task" => "setup" } ],
      "my_invites" => [ { "to" => "c", "task" => "setup", "status" => "declined" } ],
      "usual_places" => { "a" => { "morning" => "plaza", "noon" => "plaza", "night" => "home_a" } },
      "accepted_invites_to_me" => [ { "from" => "zzz", "task" => "setup" } ]
    )
    client = FakeClient.new(reply: reply(actor: "b", action_type: "reply", target: "a",
                                         params: { "task" => "setup", "answer" => "accept" }))
    proposal, = responder(client).call_billed(context)
    req = client.created.first
    text = req[:messages].first[:content]
    assert_includes text, "あなた宛ての、まだ返事をしていない誘い"
    assert_includes text, "declined"
    assert_includes text, "home_a"
    refute_includes text, "zzz"
    assert_includes req[:system_], "reply（誘いへの返事）だけは"
    schema = req.dig(:output_config, :format, :schema)
    assert_equal [ "a" ], schema.dig(:properties, :target, :anyOf, 0, :enum)
    assert_includes schema.dig(:properties, :params, :required), "answer"
    assert_equal({ "task" => "setup", "answer" => "accept" }, proposal["params"])
    assert_equal "v2", LlmResponder.config.fetch("prompt_version")
  end

  test "返答の行動案と使用量を返す。使わない params（null）は外す" do
    proposal, usage = responder(FakeClient.new(reply: reply)).call_billed(CONTEXT)
    assert_equal({ "task" => "setup" }, proposal["params"])
    assert_equal %w[a invite b], proposal.values_at("actor", "action_type", "target")
    assert_empty ProposalValidator.call(proposal, CONTEXT)
    assert_equal({ "input_tokens" => 1387, "output_tokens" => 235, "cache_creation_input_tokens" => 0, "cache_read_input_tokens" => 0 }, usage)
  end

  test "断られた・出力の上限で切れた・JSON でない返答は、行動案にしない（Rails の検証で不成立になる）。使用量は返す" do
    [ FakeClient.new(reply: "", stop: :refusal), FakeClient.new(reply: "{\"actor\":", stop: :max_tokens), FakeClient.new(reply: "こんにちは") ].each do |client|
      proposal, usage = responder(client).call_billed(CONTEXT)
      assert_nil proposal
      assert_equal 235, usage["output_tokens"]
      assert_equal [ "行動案がオブジェクトではない" ], ProposalValidator.call(proposal, CONTEXT)
    end
  end

  test "API が受け付けなかった（4xx）は課金されていないので NotBilled にする" do
    [ 400, 401, 403, 404, 413, 422, 429 ].each do |status|
      assert_raises(AiBudget::NotBilled, "#{status}") { responder(FakeClient.new(raise_on_create: status_error(status))).call_billed(CONTEXT) }
    end
  end

  test "タイムアウト・通信エラー・5xx は、課金されたか分からないのでそのまま投げる（予算では予約額の全額で数える）" do
    timeout = Anthropic::Errors::APITimeoutError.new(url: URI("https://api.anthropic.com/v1/messages"), request: nil)
    [ timeout, status_error(500), status_error(529) ].each do |error|
      e = assert_raises(Anthropic::Errors::APIError) { responder(FakeClient.new(raise_on_create: error)).call_billed(CONTEXT) }
      assert_not_kind_of AiBudget::NotBilled, e
    end
  end

  test "トークン数を数えられないときは、呼ぶ前なので Unavailable にする" do
    client = FakeClient.new(raise_on_count: status_error(503))
    assert_raises(LlmResponder::Unavailable) { responder(client).estimate(CONTEXT) }
    assert_empty client.created
  end

  test "SDK の自動の呼び直しは0回、待つ上限は設定の秒数でクライアントを作る" do
    client = LlmResponder.build_client(api_key: "test-key", config: LlmResponder.config)
    assert_equal 0, client.max_retries
    assert_equal 15.0, client.timeout.to_f
  end
end
