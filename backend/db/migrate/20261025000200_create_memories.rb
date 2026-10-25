# 住民ごとの記憶（誰が・何を・どう知ったか）と、情報伝達イベントの保存。
class CreateMemories < ActiveRecord::Migration[8.1]
  def change
    create_table :memories do |t|
      t.references :simulation_run, null: false, foreign_key: true
      t.string :owner, null: false
      t.string :fact_key, null: false
      t.text :content, null: false
      t.text :interpretation
      t.string :source, null: false
      t.integer :acquired_step, null: false
      t.references :source_event, foreign_key: {to_table: :confirmed_events}
    end
    add_index :memories, [:simulation_run_id, :owner, :fact_key], unique: true

    # tell は作業ではないため task を持たない
    change_column_null :confirmed_events, :task, true
    add_column :confirmed_events, :fact_key, :string
  end
end
