# 街ごとの AI 住民。key は config/residents.yml にあるものだけ（DB の CHECK 制約で守る）
class Resident < ApplicationRecord
  belongs_to :playthrough
  has_many :memories, dependent: :destroy
end
