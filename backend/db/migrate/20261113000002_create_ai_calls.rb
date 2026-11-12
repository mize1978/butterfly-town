# AI 呼び出し1回ごとの記録（#10）。呼ぶ前に最大額を予約し、応答後に実額で精算する。
# user_id は users（#16）を作るときに外部キーを足す
class CreateAiCalls < ActiveRecord::Migration[8.1]
  def change
    create_table :ai_calls do |t|
      t.references :playthrough, foreign_key: true
      t.references :time_slot_run, foreign_key: true
      t.integer :attempt
      t.integer :base_state_version
      t.integer :base_time_index
      t.string :applied
      t.references :guest, foreign_key: true
      t.bigint :user_id
      t.references :ai_budget_month, null: false, foreign_key: true
      t.string :request_id, null: false
      t.string :purpose, null: false
      t.string :status, null: false, default: "reserved"
      t.string :price_version, null: false
      t.integer :input_tokens_counted, null: false
      t.integer :max_output_tokens, null: false
      t.bigint :reserved_cost_micro_yen, null: false
      t.bigint :actual_cost_micro_yen
      t.integer :input_tokens
      t.integer :output_tokens
      t.timestamps

      t.index :user_id
      t.index :request_id, unique: true
      # 返答待ちの会話は街に1つだけ（ER図）
      t.index :playthrough_id, unique: true, where: "purpose = 'conversation' AND applied = 'pending'",
                               name: "index_ai_calls_one_pending_conversation"
      t.check_constraint "purpose IN ('decision', 'conversation', 'summary', 'dev')", name: "ai_calls_purpose"
      t.check_constraint "status IN ('reserved', 'succeeded', 'failed', 'unknown')", name: "ai_calls_status"
      t.check_constraint "applied IS NULL OR applied IN ('pending', 'applied', 'discarded')", name: "ai_calls_applied"
      t.check_constraint "reserved_cost_micro_yen >= 0 AND (actual_cost_micro_yen IS NULL OR actual_cost_micro_yen >= 0)",
                         name: "ai_calls_costs"
      t.check_constraint "input_tokens_counted >= 0 AND max_output_tokens > 0", name: "ai_calls_tokens"
      # 精算済み（succeeded・unknown）は実額を持つ。unknown は予約額の全額を使ったものとして数える
      t.check_constraint "status NOT IN ('succeeded', 'unknown') OR actual_cost_micro_yen IS NOT NULL", name: "ai_calls_settled_cost"
      t.check_constraint "status <> 'unknown' OR actual_cost_micro_yen = reserved_cost_micro_yen", name: "ai_calls_unknown_full"
    end
  end
end
