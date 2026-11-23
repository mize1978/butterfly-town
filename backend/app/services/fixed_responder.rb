# 決まった応答（config/fixed_responses.yml）。実LLM（#11）の代わりに、本人が知っている事実だけで行動案を1つ返す。
# 受け取るのは ResidentContext の Hash と、Rails だけが渡す受けた誘い（accepted_invites_to_me）で、DB には触れない。
# 成立するかは ProposalValidator が決める。これは決まった分岐であって、AI が自分で判断できることの証明ではない。
#
# ルールの条件（どれも省略できる。書いたものをすべて満たす最初のルールを使う）：
#   actor / requires_known / requires_unknown：本人と、知っている・知らない事実
#   present / absent：その場にいる・いない住民（#55）
#   location：いまいる場所（#55）
#   my_invite：自分が出した誘いの状態 { to:, status: [none, pending, accepted, declined] }（#55）
#   invite_to_me：自分宛ての未回答の誘いがある（pending）（#55）
#   accepted_invite / parts：受けた誘いがある・時間帯（morning・noon・night）（#55）
class FixedResponder
  PATH = Rails.root.join("config/fixed_responses.yml")

  def self.default = @default ||= new(YAML.safe_load_file(PATH).fetch("rules"))

  def initialize(rules) = @rules = rules

  def call(context, accepted_invites_to_me: [])
    me = context.fetch("resident_key")
    rule = @rules.find { |r| (r["actor"].nil? || r["actor"] == me) && matches?(r, context, accepted_invites_to_me) }
    rule.fetch("response").merge("actor" => me, "rule_id" => rule.fetch("id"))
  end

  private

  def matches?(rule, context, accepted)
    known = context.fetch("memories").map { _1.fetch("fact_key") }
    present = context.fetch("present")
    (rule.fetch("requires_known", []) - known).empty? && (rule.fetch("requires_unknown", []) & known).empty? &&
      (rule.fetch("present", []) - present).empty? && (rule.fetch("absent", []) & present).empty? &&
      (rule["location"].nil? || rule["location"] == context.fetch("location")) &&
      my_invite?(rule["my_invite"], context) &&
      (rule["invite_to_me"].nil? || context.fetch("invites_to_me").any?) &&
      (rule["accepted_invite"].nil? || accepted.any?) &&
      (rule["parts"].nil? || rule["parts"].include?(context.fetch("part")))
  end

  def my_invite?(condition, context)
    return true if condition.nil?

    invite = context.fetch("my_invites").find { _1["to"] == condition.fetch("to") }
    condition.fetch("status").include?(invite ? invite["status"] : "none")
  end
end
