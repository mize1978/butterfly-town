# 決まった応答（config/fixed_responses.yml）。実LLM（#11）の代わりに、本人が知っている事実だけで行動案を1つ返す。
# 受け取るのは ResidentContext の Hash だけで、DB には触れない。成立するかは ProposalValidator が決める。
# これは決まった分岐であって、AI が自分で判断できることの証明ではない
class FixedResponder
  PATH = Rails.root.join("config/fixed_responses.yml")

  def self.default = @default ||= new(YAML.safe_load_file(PATH).fetch("rules"))

  def initialize(rules) = @rules = rules

  def call(context)
    me = context.fetch("resident_key")
    known = context.fetch("memories").map { _1.fetch("fact_key") }
    rule = @rules.find do |r|
      (r["actor"].nil? || r["actor"] == me) &&
        (r.fetch("requires_known", []) - known).empty? && (r.fetch("requires_unknown", []) & known).empty?
    end
    rule.fetch("response").merge("actor" => me, "rule_id" => rule.fetch("id"))
  end
end
