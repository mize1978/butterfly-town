# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_10_25_000200) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "confirmed_events", force: :cascade do |t|
    t.bigint "simulation_run_id", null: false
    t.string "command_id", null: false
    t.string "kind", null: false
    t.string "actor", null: false
    t.string "target"
    t.string "task"
    t.integer "step", null: false
    t.bigint "cause_id"
    t.json "command", null: false
    t.string "fact_key"
    t.index ["simulation_run_id", "command_id"], name: "index_confirmed_events_on_simulation_run_id_and_command_id", unique: true
    t.index ["simulation_run_id"], name: "index_confirmed_events_on_simulation_run_id"
  end

  create_table "memories", force: :cascade do |t|
    t.bigint "simulation_run_id", null: false
    t.string "owner", null: false
    t.string "fact_key", null: false
    t.text "content", null: false
    t.text "interpretation"
    t.string "source", null: false
    t.integer "acquired_step", null: false
    t.bigint "source_event_id"
    t.index ["simulation_run_id", "owner", "fact_key"], name: "index_memories_on_simulation_run_id_and_owner_and_fact_key", unique: true
    t.index ["simulation_run_id"], name: "index_memories_on_simulation_run_id"
    t.index ["source_event_id"], name: "index_memories_on_source_event_id"
  end

  create_table "simulation_runs", force: :cascade do |t|
    t.integer "progress", default: 0, null: false
    t.integer "step", default: 0, null: false
    t.json "locations", default: {}, null: false
  end

  add_foreign_key "confirmed_events", "confirmed_events", column: "cause_id"
  add_foreign_key "confirmed_events", "simulation_runs"
  add_foreign_key "memories", "confirmed_events", column: "source_event_id"
  add_foreign_key "memories", "simulation_runs"
end
