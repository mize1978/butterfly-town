# 月ごとの AI 予算（#10）。金額は「100万分の1円」の整数（bigint）
class CreateAiBudgetMonths < ActiveRecord::Migration[8.1]
  def change
    create_table :ai_budget_months do |t|
      t.string :month, null: false
      t.bigint :limit_micro_yen, null: false
      t.bigint :reserved_micro_yen, null: false, default: 0
      t.bigint :spent_micro_yen, null: false, default: 0
      t.timestamps

      t.index :month, unique: true
      t.check_constraint "month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'", name: "ai_budget_months_month_format"
      t.check_constraint "limit_micro_yen > 0 AND reserved_micro_yen >= 0 AND spent_micro_yen >= 0", name: "ai_budget_months_amounts"
    end
  end
end
