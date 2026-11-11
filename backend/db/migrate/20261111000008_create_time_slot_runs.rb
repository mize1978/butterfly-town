# 時間帯ごとの AI 処理。1つの街の1つの時間帯につき1行（やり直しは attempt を増やす）
class CreateTimeSlotRuns < ActiveRecord::Migration[8.1]
  def change
    create_table :time_slot_runs do |t|
      t.references :playthrough, null: false, foreign_key: true, index: false
      t.integer :time_index, null: false
      t.string :status, null: false
      t.integer :attempt, null: false, default: 1
      t.integer :base_state_version, null: false
      t.string :suspend_reason
      t.timestamps

      t.index %i[playthrough_id time_index], unique: true
      # 処理中の時間帯は街に1つだけ
      t.index :playthrough_id, unique: true, where: "status = 'running'", name: "index_time_slot_runs_one_running"
      t.check_constraint "time_index BETWEEN 0 AND 14", name: "time_slot_runs_time_index"
      t.check_constraint "status IN ('running', 'confirmed', 'suspended', 'failed')", name: "time_slot_runs_status"
      t.check_constraint "attempt >= 1", name: "time_slot_runs_attempt"
      t.check_constraint "suspend_reason IS NULL OR suspend_reason IN ('budget', 'network', 'unknown_result', 'version_mismatch')",
                         name: "time_slot_runs_suspend_reason"
    end
  end
end
