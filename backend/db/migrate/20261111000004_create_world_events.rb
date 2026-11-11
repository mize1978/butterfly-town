# 実際に成立した出来事。同じ命令（command_id）で二重に作らない
class CreateWorldEvents < ActiveRecord::Migration[8.1]
  def change
    create_table :world_events do |t|
      t.references :playthrough, null: false, foreign_key: true
      t.string :command_id, null: false
      t.string :kind, null: false # invite / tell / refuse / intervention など。種類は時間帯の処理（#8）で決める
      t.string :actor_key # 住民キー または player
      t.string :target_key
      t.integer :time_index, null: false
      t.references :cause, foreign_key: { to_table: :world_events }
      t.string :fact_key
      t.jsonb :payload, null: false, default: {}
      t.timestamps

      t.index %i[playthrough_id command_id], unique: true
      t.check_constraint "time_index BETWEEN 0 AND 14", name: "world_events_time_index"
    end
  end
end
