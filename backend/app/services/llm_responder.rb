# 実LLM（#30）で、住民1人の次の行動案を1つ返す。技術試作（#5、compare-v1）の LlmResponder を本編の入力（ResidentContext）に合わせて移した。
# FixedResponder と同じく「行動案を返すだけ」で、成立するかは ProposalValidator が決める。
# 費用は TimeSlotProcessor が AiBudget で予約・精算する（このクラスは予算に触れない）。
#
#   estimate：入力トークン数を数える（count_tokens。課金されない）。数えられなければ Unavailable（呼ぶ前）
#   call_billed：呼んで [行動案, 使用量] を返す。断られた・切れた・JSON でない返答は、行動案を nil にする（不成立）
#     API が受け付けなかった（4xx）は課金されていないので AiBudget::NotBilled。
#     タイムアウト・通信エラー・5xx は課金されたか分からないので、そのまま投げる（予約額の全額で数える）
#
# 自動の呼び直しはしない（SDK の max_retries は0）。API を待つ間に DB のロックは持たない（呼ぶ側で守る）
class LlmResponder
  class Unavailable < StandardError; end

  CONFIG_PATH = Rails.root.join("config/resident_llm.yml")
  ACTIONS = {
    "invite" => "相手を祭りの準備（task: setup）に誘う。target と params.task が必要",
    "consult" => "相手に、ある人について相談する。target と params.about（誰について）が必要",
    "tell" => "自分が覚えている出来事を相手に話す。target と params.fact_key（自分の記憶の fact_key）が必要",
    "work" => "自分で準備（task: setup）を進める。target は null、params.task が必要",
    "move" => "別の場所へ行くと決める。次の朝か昼から、その日の昼まで行き先にいる（夜は家に戻る）。target は null、params.to（場所）が必要",
    "reply" => "自分宛ての誘いに返事をする（受ける・断る）。target は誘ってくれた人（離れていても届く）、" \
               "params.task（誘いの task）と params.answer（accept か decline）が必要。返事は1つの誘いに1回だけ",
    "continue_routine" => "いつもの日課を続ける。target は null"
  }.freeze
  PARAM_KEYS = %w[task fact_key about to answer].freeze
  KEYS = %w[actor action_type target params reason].freeze

  def self.config = @config ||= YAML.safe_load_file(CONFIG_PATH).freeze

  def self.build_client(api_key:, config: self.config)
    Anthropic::Client.new(api_key: api_key, max_retries: Integer(config.fetch("max_retries")),
                          timeout: Float(config.fetch("timeout_seconds")))
  end

  def initialize(client:, config: self.class.config)
    @client, @config = client, config
  end

  def billable? = true
  def model = @config.fetch("model")

  def estimate(context)
    input = @client.messages.count_tokens(**request(context).except(:max_tokens),
                                          request_options: { timeout: Float(@config.fetch("count_tokens_timeout_seconds")) }).input_tokens
    [ input, max_output_tokens ]
  rescue Anthropic::Errors::Error => e
    raise Unavailable, "入力トークン数を数えられなかった：#{e.class.name.demodulize}"
  end

  def call_billed(context)
    message = @client.messages.create(**request(context))
    [ proposal(message), usage(message.usage) ]
  rescue Anthropic::Errors::APIStatusError => e
    raise unless e.status.to_i.between?(400, 499)

    raise AiBudget::NotBilled, "API が受け付けなかった（#{e.status}）"
  end

  # 呼び出しの中身（API キーなしで確かめられるよう公開する）
  def request(context)
    {
      model: model, max_tokens: max_output_tokens, system_: system_prompt,
      messages: [ { role: "user", content: user_prompt(context) } ],
      output_config: { format: { type: :json_schema, schema: schema(context) } }
    }
  end

  private

  def max_output_tokens = Integer(@config.fetch("max_output_tokens"))

  # target の候補：その場にいる相手と、未回答の誘いをくれた相手（reply 用）。
  # どの行動でどの相手を選べるかは ProposalValidator が行動ごとに確かめる（invite・consult・tell はその場にいる相手だけ）
  def schema(context)
    present = (context.fetch("present") + context.fetch("invites_to_me").map { _1.fetch("from") }).uniq.sort
    nullable = { anyOf: [ { type: "string" }, { type: "null" } ] }
    {
      type: "object", additionalProperties: false, required: KEYS,
      properties: {
        actor: { type: "string", enum: [ context.fetch("resident_key") ] },
        action_type: { type: "string", enum: ACTIONS.keys },
        target: present.empty? ? { type: "null" } : { anyOf: [ { type: "string", enum: present }, { type: "null" } ] },
        params: { type: "object", additionalProperties: false, required: PARAM_KEYS, properties: PARAM_KEYS.to_h { [ _1, nullable ] } },
        reason: { type: "string" }
      }
    }
  end

  # 返答を行動案にする。断られた・出力の上限で切れた・JSON でない・オブジェクトでないときは nil
  def proposal(message)
    return nil if %i[refusal max_tokens].include?(message.stop_reason&.to_sym)

    text = message.content.select { _1.type.to_s == "text" }.map(&:text).join
    parsed = JSON.parse(text)
    return nil unless parsed.is_a?(Hash)

    parsed.merge("params" => parsed["params"].is_a?(Hash) ? parsed["params"].compact : parsed["params"])
  rescue JSON::ParserError
    nil
  end

  def usage(u)
    { "input_tokens" => u.input_tokens.to_i, "output_tokens" => u.output_tokens.to_i,
      "cache_creation_input_tokens" => u.cache_creation_input_tokens.to_i,
      "cache_read_input_tokens" => u.cache_read_input_tokens.to_i }
  end

  def system_prompt
    <<~PROMPT
      あなたは小さな街に住む住民の1人です。いま、この瞬間に取る行動を1つだけ選んでください。
      - 判断に使ってよいのは、渡された「あなた自身の情報」と「あなたの記憶」だけです。記憶にないことは知りません。
      - 選べる行動は「選べる行動」に書かれたものだけです。相手に選べるのは、いま同じ場所にいる人だけです。
        ただし reply（誘いへの返事）だけは、あなたを誘ってくれた人を、離れていても選べます。
      - 「知り合いのいつもの居場所」は、みんなが知っている日課です。その人がいま実際にどこにいるかは分かりません。
      - reason には、なぜその行動を選んだかを、あなた自身の言葉で日本語の短い1〜2文（#{@config.fetch('reason_max_chars')}字以内）で書いてください。
      - 使わない項目は null にしてください。
    PROMPT
  end

  def user_prompt(context)
    me = {
      "あなた" => context.fetch("resident_key"), "性格" => context.fetch("personality"), "目標" => context.fetch("goals"),
      "時間帯" => context.fetch("part"), "いる場所" => context.fetch("location"),
      "同じ場所にいる人" => context.fetch("present"), "行ける場所" => context.fetch("locations"),
      "あなたの記憶" => context.fetch("memories"),
      "あなた宛ての、まだ返事をしていない誘い" => context.fetch("invites_to_me"),
      "あなたが出した誘いと、その結果（pending＝返事待ち・accepted＝受けてもらえた・declined＝断られた）" => context.fetch("my_invites"),
      "知り合いのいつもの居場所（時間帯ごとの日課）" => context.fetch("usual_places")
    }
    "## あなた自身の情報\n#{JSON.pretty_generate(me)}\n\n## 選べる行動\n" + ACTIONS.map { |k, v| "- #{k}：#{v}" }.join("\n")
  end
end
