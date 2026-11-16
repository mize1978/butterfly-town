# 月ごとの AI 予算。reserved：精算前の予約の合計。spent：精算した実額と、結果が分からない呼び出しの予約額の合計
class AiBudgetMonth < ApplicationRecord
  has_many :ai_calls, dependent: :restrict_with_exception

  def used_micro_yen = reserved_micro_yen + spent_micro_yen
  def remaining_micro_yen = limit_micro_yen - used_micro_yen
end
