# 1回のプレイ（街）。持ち主はユーザーかゲストのどちらか一方（DB の CHECK 制約で守る）。
# users は #16 で作るので、いまは user_id の列だけ
class Playthrough < ApplicationRecord
  belongs_to :guest, optional: true
  has_many :residents, dependent: :destroy
  has_many :world_events, dependent: :destroy
  has_many :relationships, dependent: :destroy
  has_many :conversation_messages, dependent: :destroy
  has_many :time_slot_runs, dependent: :destroy
end
