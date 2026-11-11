# 住民ごとの記憶。AI に渡すのは、その住民の行だけ
class CreateMemories < ActiveRecord::Migration[8.1]
  def change
    create_table :memories do |t|
      t.references :resident, null: false, foreign_key: true
      t.string :fact_key, null: false
      t.text :content, null: false
      t.text :interpretation
      t.string :source, null: false
      t.integer :acquired_time_index
      t.references :source_event, foreign_key: { to_table: :world_events }
      t.timestamps

      t.index %i[resident_id fact_key], unique: true
      t.check_constraint "source IN ('witnessed', 'told', 'initial')", name: "memories_source"
    end
  end
end
