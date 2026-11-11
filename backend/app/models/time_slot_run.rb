# 時間帯ごとの AI 処理。1つの街の1つの時間帯につき1行で、処理中（running）は街に1つだけ
class TimeSlotRun < ApplicationRecord
  belongs_to :playthrough
end
