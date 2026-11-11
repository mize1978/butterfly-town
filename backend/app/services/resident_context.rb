# 判断（決まった応答・実LLM）へ渡す入力。本人の情報・記憶と、同じ場所にいる相手だけを入れる。
# 街全体やほかの住民の記憶は入れない
class ResidentContext
  # locations：この時間帯に日課で動いた後の、住民ごとの場所（{"a" => "plaza", ...}）
  def self.build(resident, playthrough, locations:)
    definition = ResidentCatalog.find(resident.key)
    here = locations.fetch(resident.key)
    {
      "resident_key" => resident.key,
      "time_index" => playthrough.time_index,
      "part" => ResidentCatalog.part_of(playthrough.time_index),
      "location" => here,
      "present" => locations.select { |key, loc| key != resident.key && loc == here }.keys.sort,
      "locations" => ResidentCatalog.locations,
      "personality" => definition.fetch("personality"),
      "goals" => definition.fetch("goals"),
      "memories" => resident.memories.order(:id).map do |m|
        { "fact_key" => m.fact_key, "content" => m.content, "interpretation" => m.interpretation, "source" => m.source }
      end
    }
  end
end
