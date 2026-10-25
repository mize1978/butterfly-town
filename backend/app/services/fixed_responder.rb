# 実LLMの代わりに、固定ルールで行動案を返す。
# 受け取るのは ResidentContext の Hash だけで、DBには触れない。成立するかは FixedActionProcessor が判定する。
# これは固定応答の分岐であり、AIが自律的に判断できることの証明ではない。
class FixedResponder
  class NoMatchingResponse < StandardError; end
  RULES_PATH = Rails.root.join("../fixtures/spike/fixed_responses.json")

  def self.from_file(path = RULES_PATH)
    new(JSON.parse(File.read(path)).fetch("rules"))
  end

  def initialize(rules)
    @rules = rules
  end

  # 上から順に、本人が知っている事実（fact_key）の条件に合う最初のルールを使う
  def call(context)
    known = context.fetch("memories").map { |m| m.fetch("fact_key") }
    rule = @rules.find do |r|
      r.fetch("actor") == context.fetch("resident_id") && r.fetch("scene") == context.fetch("scene") &&
        (r.fetch("requires_known", []) - known).empty? && (r.fetch("requires_unknown", []) & known).empty?
    end
    raise NoMatchingResponse, "no rule for #{context["resident_id"]}" unless rule
    rule.fetch("response").merge("rule_id" => rule.fetch("id"))
  end
end
