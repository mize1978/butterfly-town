# 1回のプレイ（街）。持ち主はユーザーかゲストのどちらか一方。
# users は #16 で作るので、user_id の外部キーはそのときに足す
class CreatePlaythroughs < ActiveRecord::Migration[8.1]
  def change
    create_table :playthroughs do |t|
      t.bigint :user_id, index: true
      t.references :guest, foreign_key: true
      t.string :mission_key, null: false
      t.string :status, null: false, default: "in_progress"
      t.integer :time_index, null: false, default: 0
      t.integer :interventions_used, null: false, default: 0
      t.integer :state_version, null: false, default: 0
      t.integer :festival_progress, null: false, default: 0
      t.string :result
      t.string :character_key
      t.string :outfit_key
      t.float :player_x
      t.float :player_y
      t.datetime :position_saved_at
      t.datetime :saved_at
      t.datetime :finished_at
      t.timestamps

      t.check_constraint "(user_id IS NULL) <> (guest_id IS NULL)", name: "playthroughs_one_owner"
      t.check_constraint "status IN ('in_progress', 'shelved', 'finished', 'abandoned')", name: "playthroughs_status"
      t.check_constraint "result IS NULL OR result IN ('success', 'failure')", name: "playthroughs_result"
      t.check_constraint "time_index BETWEEN 0 AND 14", name: "playthroughs_time_index"
      t.check_constraint "interventions_used BETWEEN 0 AND 3", name: "playthroughs_interventions_used"
      t.check_constraint "state_version >= 0", name: "playthroughs_state_version"
    end
    # 同じミッションの進行中の街は1ユーザーに1つ（保管した街は数えない）
    add_index :playthroughs, %i[user_id mission_key], unique: true, where: "status = 'in_progress'",
              name: "index_playthroughs_one_in_progress_per_user"
  end
end
