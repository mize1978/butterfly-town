# 実LLM（Claude Haiku 5.5）で、住民1人の次の行動案を1つ選ばせる（Issue #5 の検証用）。
# FixedResponder と同じく「行動案を返すだけ」で、成立するかは決めない（Rails 側の検証で判断する）。
#
# 1回の流れ：
#   1. 入力トークン数を数える（count_tokens。課金されない）
#   2. 予算台帳に最悪の額を予約する。足りなければ呼ばない
#   3. 呼ぶ（自動再試行はしない：再試行で二重に課金されても台帳に載らないため）
#   4. 応答の使用量で精算し、返答の形を確かめる。形が合わなければ不成立
# 応答が返らなかった呼び出しは精算しない（予約額のまま使ったものとして数える）
require "json"
require_relative "llm_budget"

class LlmResponder
  PROMPT_VERSION = "v1"
  MODEL = "claude-haiku-5-5"
  ACTIONS = {
    "invite" => "相手を祭りの準備（task: setup）に誘う。target と params.task が必要",
    "consult" => "相手に、ある人について相談する。target と params.about（誰について）が必要",
    "tell" => "自分が覚えている出来事を相手に話す。target と params.fact_key（自分の記憶の fact_key）が必要",
    "work" => "自分で準備（task: setup）を進める。target は null、params.task が必要",
    "move" => "別の場所へ行く。target は null、params.to（場所）が必要",
    "continue_routine" => "いつもの日課を続ける。target は null"
  }.freeze
  PARAM_KEYS = %w[task fact_key about to].freeze
  KEYS = %w[actor action_type target params reason].freeze
  REASON_MAX = 200

  Result = Struct.new(:status, :proposal, :errors, :usage, :latency_ms, :stop_reason, :text, :reservation_id,
                      keyword_init: true) do
    def ok? = status == "ok"
  end

  def initialize(client:, budget:, max_tokens: 2048)
    @client, @budget, @max_tokens = client, budget, max_tokens
  end

  # context：本人の情報だけ（resident_id, scene, step, location, personality, goals, present, locations, memories）
  def call(context)
    params = request(context)
    input = @client.messages.count_tokens(**params.except(:max_tokens)).input_tokens
    id = @budget.reserve!(input_tokens: input, max_tokens: @max_tokens, label: context["resident_id"])
    started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    message = @client.messages.create(**params)
    latency = ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - started) * 1000).round
    usage = usage_hash(message.usage)
    @budget.settle!(id, usage:, latency_ms: latency)
    judge(context, message, usage:, latency:, id:)
  rescue LlmBudget::OverBudget => e
    Result.new(status: "over_budget", errors: [e.message])
  rescue Anthropic::Errors::APIError => e
    # 予約したあとに失敗した場合は精算しない（課金されたか分からないため、予約額で数える）
    Result.new(status: "error", errors: ["#{e.class.name.split("::").last}: #{e.message}"], reservation_id: id)
  end

  # 呼び出しの中身（APIキーなしで確かめられるよう公開する）
  def request(context)
    {
      model: MODEL,
      max_tokens: @max_tokens,
      system_: system_prompt,
      messages: [{ role: "user", content: user_prompt(context) }],
      output_config: { format: { type: :json_schema, schema: self.class.schema(context) } }
    }
  end

  def self.schema(context)
    me = context.fetch("resident_id")
    others = context.fetch("present") - [me]
    nullable = { anyOf: [{ type: "string" }, { type: "null" }] }
    {
      type: "object", additionalProperties: false, required: KEYS,
      properties: {
        actor: { type: "string", enum: [me] },
        action_type: { type: "string", enum: ACTIONS.keys },
        target: others.empty? ? { type: "null" } : { anyOf: [{ type: "string", enum: others }, { type: "null" }] },
        params: { type: "object", additionalProperties: false, required: PARAM_KEYS,
                  properties: PARAM_KEYS.to_h { |k| [k, nullable] } },
        reason: { type: "string" }
      }
    }
  end

  # 返答の形を確かめる。問題がなければ空配列
  def self.validate(context, proposal)
    return ["JSONのオブジェクトではない"] unless proposal.is_a?(Hash)
    errors = []
    errors << "項目が違う：#{proposal.keys.sort.join(",")}" unless proposal.keys.sort == KEYS.sort
    me = context.fetch("resident_id")
    others = context.fetch("present") - [me]
    known = context.fetch("memories").map { |m| m.fetch("fact_key") }
    params = proposal["params"]
    return errors + ["params がオブジェクトではない"] unless params.is_a?(Hash)
    errors << "params に知らない項目がある" unless (params.keys - PARAM_KEYS).empty?

    errors << "actor が本人ではない" unless proposal["actor"] == me
    type, target = proposal["action_type"], proposal["target"]
    case type
    when "invite", "consult", "tell"
      errors << "target がその場にいる相手ではない" unless others.include?(target)
    when "work", "move", "continue_routine"
      errors << "target は null のはず" unless target.nil?
    else
      errors << "知らない行動：#{type.inspect}"
    end
    case type
    when "invite", "work" then errors << "params.task は setup のはず" unless params["task"] == "setup"
    when "tell" then errors << "本人の記憶にない fact_key を話そうとした" unless known.include?(params["fact_key"])
    when "consult" then errors << "params.about が空" unless params["about"].is_a?(String) && !params["about"].strip.empty?
    when "move" then errors << "params.to が知らない場所" unless context.fetch("locations").include?(params["to"])
    end
    reason = proposal["reason"]
    errors << "reason が空か長すぎる" unless reason.is_a?(String) && !reason.strip.empty? && reason.size <= REASON_MAX
    errors
  end

  private

  def judge(context, message, usage:, latency:, id:)
    base = { usage:, latency_ms: latency, stop_reason: message.stop_reason.to_s, reservation_id: id }
    text = message.content.select { |b| b.type == :text }.map(&:text).join
    return Result.new(**base, status: "refused", text:, errors: ["応答を断られた"]) if message.stop_reason == :refusal
    return Result.new(**base, status: "truncated", text:, errors: ["出力の上限で途中まで"]) if message.stop_reason == :max_tokens
    proposal = begin
      JSON.parse(text)
    rescue JSON::ParserError
      return Result.new(**base, status: "invalid", text:, errors: ["JSONとして読めない"])
    end
    errors = self.class.validate(context, proposal)
    Result.new(**base, status: errors.empty? ? "ok" : "invalid", proposal:, errors:, text:)
  end

  def usage_hash(u)
    { "input_tokens" => u.input_tokens, "output_tokens" => u.output_tokens,
      "cache_creation_input_tokens" => u.cache_creation_input_tokens.to_i,
      "cache_read_input_tokens" => u.cache_read_input_tokens.to_i }
  end

  def system_prompt
    <<~PROMPT
      あなたは小さな街に住む住民の1人です。いま、この瞬間に取る行動を1つだけ選んでください。
      - 判断に使ってよいのは、渡された「あなた自身の情報」と「あなたの記憶」だけです。記憶にないことは知りません。
      - 選べる行動は「選べる行動」に書かれたものだけです。相手に選べるのは、いま同じ場所にいる人だけです。
      - reason には、なぜその行動を選んだかを、あなた自身の言葉で日本語の短い1〜2文（#{REASON_MAX}字以内）で書いてください。
      - 使わない項目は null にしてください。
    PROMPT
  end

  def user_prompt(context)
    me = {
      "あなた" => context.fetch("resident_id"), "性格" => context.fetch("personality"), "目標" => context.fetch("goals"),
      "場面" => context.fetch("scene"), "いる場所" => context.fetch("location"),
      "同じ場所にいる人" => context.fetch("present") - [context.fetch("resident_id")],
      "行ける場所" => context.fetch("locations"),
      "あなたの記憶" => context.fetch("memories")
    }
    "## あなた自身の情報\n#{JSON.pretty_generate(me)}\n\n## 選べる行動\n" +
      ACTIONS.map { |k, v| "- #{k}：#{v}" }.join("\n")
  end
end
