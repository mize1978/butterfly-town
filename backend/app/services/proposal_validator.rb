# 行動案が成り立つかを Rails が確かめる。問題がなければ空配列、あれば理由の配列を返す。
# 決まった応答（#8）でも実LLM（#11）でも、同じ検証を通ったものだけを出来事にする
class ProposalValidator
  ACTIONS = %w[invite consult tell work move continue_routine].freeze
  WITH_TARGET = %w[invite consult tell].freeze

  def self.call(proposal, context)
    return [ "行動案がオブジェクトではない" ] unless proposal.is_a?(Hash)

    errors = []
    params = proposal["params"].is_a?(Hash) ? proposal["params"] : {}
    type, target = proposal["action_type"], proposal["target"]
    errors << "actor が本人ではない" unless proposal["actor"] == context.fetch("resident_key")
    return errors + [ "知らない行動：#{type.inspect}" ] unless ACTIONS.include?(type)

    if WITH_TARGET.include?(type)
      errors << "target がその場にいる相手ではない" unless context.fetch("present").include?(target)
    elsif !target.nil?
      errors << "target は null のはず"
    end
    known = context.fetch("memories").map { _1.fetch("fact_key") }
    case type
    when "invite", "work" then errors << "params.task は setup のはず" unless params["task"] == "setup"
    when "tell" then errors << "本人の記憶にない fact_key を話そうとした" unless known.include?(params["fact_key"])
    when "consult" then errors << "params.about が空" unless params["about"].is_a?(String) && params["about"].strip != ""
    when "move" then errors << "params.to が知らない場所" unless context.fetch("locations").include?(params["to"])
    end
    errors
  end
end
