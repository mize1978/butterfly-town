# AI 呼び出し1回の記録。予約（reserved）→ 精算（succeeded・failed・unknown）。
# applied は返答をゲームに反映したか（時間帯・会話の呼び出しだけ。開発検証は空）
class AiCall < ApplicationRecord
  belongs_to :ai_budget_month
  belongs_to :playthrough, optional: true
  belongs_to :time_slot_run, optional: true
  belongs_to :guest, optional: true
end
