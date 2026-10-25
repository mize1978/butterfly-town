class SimulationRun < ApplicationRecord
  # memories は confirmed_events を参照するため先に削除する
  has_many :memories, dependent: :destroy
  has_many :confirmed_events, dependent: :destroy
end
