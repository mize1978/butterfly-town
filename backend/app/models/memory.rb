# 住民ごとの記憶。source は witnessed / told / initial
class Memory < ApplicationRecord
  belongs_to :resident
  belongs_to :source_event, class_name: "WorldEvent", optional: true
end
