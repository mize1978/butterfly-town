# 判断（決まった応答・実LLM）へ渡す入力。本人の情報・記憶と、同じ場所にいる相手だけを入れる。
# 街全体やほかの住民の記憶は入れない。
# #55 で足したもの：自分宛ての未回答の誘い（invites_to_me）・自分が出した誘いの結果（my_invites）・
# 知り合いのいつもの居場所（usual_places。日課の公開情報で、実際の現在地や移動の予定ではない）。
# 受けた誘い（承諾済み）はここには入れない（Rails が判断の機会と決まった応答の作業ルールにだけ使う）
class ResidentContext
  # locations：この時間帯に日課（と移動の予定）で動いた後の、住民ごとの場所（{"a" => "plaza", ...}）
  def self.build(resident, playthrough, locations:, invitations: Invitations.new(playthrough))
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
      "memories" => resident.memories.sort_by(&:id).map do |m|
        { "fact_key" => m.fact_key, "content" => m.content, "interpretation" => m.interpretation, "source" => m.source }
      end,
      "invites_to_me" => invitations.pending_to(resident.key).map { { "from" => _1.from, "task" => _1.task } },
      "my_invites" => invitations.from(resident.key).map { { "to" => _1.to, "task" => _1.task, "status" => _1.status } },
      "usual_places" => (locations.keys - [ resident.key ]).sort.to_h { [ _1, ResidentCatalog.routine(_1) ] }
    }
  end
end
