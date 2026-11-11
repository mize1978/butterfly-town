# 1回のプレイ（街）。持ち主はユーザーかゲストのどちらか一方（DB の CHECK 制約で守る）。
# users は #16 で作るので、いまは user_id の列だけ
class Playthrough < ApplicationRecord
  MISSION = "festival" # MVP のミッションは1本
  TIME_SLOTS = 15      # 時間帯 0〜14
  INTERVENTIONS = 3

  belongs_to :guest, optional: true
  has_many :residents, dependent: :destroy
  has_many :world_events, dependent: :destroy
  has_many :relationships, dependent: :destroy
  has_many :conversation_messages, dependent: :destroy
  has_many :time_slot_runs, dependent: :destroy

  scope :in_progress, -> { where(status: "in_progress") }

  # ゲストの進行中の街を返す。無ければ初期状態で作る。作ったときは2つ目の値が true
  def self.current_for(guest) = guest.playthroughs.in_progress.find_by(mission_key: MISSION)

  def self.start_for!(guest)
    current = current_for(guest)
    return [ current, false ] if current

    created = transaction do
      create!(guest: guest, mission_key: MISSION).tap do |pt|
        ResidentCatalog.all.each { pt.residents.create!(key: _1.fetch("key"), location_key: _1.fetch("location")) }
      end
    end
    [ created, true ]
  rescue ActiveRecord::RecordNotUnique
    # 同じゲストの「開始」が同時に届き、先に作られていた
    [ current_for(guest) || raise, false ]
  end

  def state
    {
      status: status,
      time_index: time_index,
      time_slots: TIME_SLOTS,
      festival_progress: festival_progress,
      interventions_left: INTERVENTIONS - interventions_used,
      residents: residents.sort_by { ResidentCatalog.keys.index(_1.key) }.map { { key: _1.key, location_key: _1.location_key } }
    }
  end
end
