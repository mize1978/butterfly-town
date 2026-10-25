class Memory < ApplicationRecord
  belongs_to :simulation_run
  belongs_to :source_event, class_name: "ConfirmedEvent", optional: true

  # その時点までに取得済みの記憶だけ。未来に得る記憶を判断や伝達に使わせない
  scope :known_at, ->(step) { where(acquired_step: ..step) }
end
