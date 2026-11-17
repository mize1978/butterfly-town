# 住民の判断の作り手の差し替え口（#30）。環境変数 RESIDENT_RESPONDER で選ぶ。
#   fixed（指定なしも同じ）：決まった応答（費用なし）。テストといまの公開版
#   llm：実LLM。API キーは環境変数 ANTHROPIC_API_KEY だけに置く。無ければ黙って戻さず失敗させる
class ResidentResponder
  def self.default = @default ||= build(ENV)

  def self.build(env)
    case env.fetch("RESIDENT_RESPONDER", "fixed")
    when "fixed" then FixedResponder.default
    when "llm"
      key = env["ANTHROPIC_API_KEY"].presence or raise KeyError, "RESIDENT_RESPONDER=llm には ANTHROPIC_API_KEY が必要"
      LlmResponder.new(client: LlmResponder.build_client(api_key: key))
    else raise ArgumentError, "RESIDENT_RESPONDER が正しくない：#{env['RESIDENT_RESPONDER'].inspect}"
    end
  end
end
