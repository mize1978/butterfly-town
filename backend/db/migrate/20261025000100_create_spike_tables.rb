class CreateSpikeTables < ActiveRecord::Migration[8.1]
  def change
    create_table :simulation_runs do |t|
      t.integer :progress, null: false, default: 0
      t.integer :step, null: false, default: 0
      t.json :locations, null: false, default: {}
    end
    create_table :confirmed_events do |t|
      t.references :simulation_run, null: false, foreign_key: true
      t.string :command_id, null: false
      t.string :kind, null: false
      t.string :actor, null: false
      t.string :target
      t.string :task, null: false
      t.integer :step, null: false
      t.bigint :cause_id
      t.json :command, null: false
    end
    add_index :confirmed_events, [:simulation_run_id, :command_id], unique: true
    add_foreign_key :confirmed_events, :confirmed_events, column: :cause_id
  end
end
