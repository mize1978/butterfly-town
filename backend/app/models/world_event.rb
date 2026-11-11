# 実際に成立した出来事。cause は、この出来事のきっかけになった出来事
class WorldEvent < ApplicationRecord
  belongs_to :playthrough
  belongs_to :cause, class_name: "WorldEvent", optional: true
end
