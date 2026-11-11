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

ActiveRecord::Schema[8.1].define(version: 2026_11_12_000001) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "conversation_messages", force: :cascade do |t|
    t.bigint "playthrough_id", null: false
    t.integer "time_index", null: false
    t.string "speaker_key", null: false
    t.string "listener_key", null: false
    t.text "body", null: false
    t.bigint "ai_call_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["ai_call_id"], name: "index_conversation_messages_on_ai_call_id"
    t.index ["playthrough_id"], name: "index_conversation_messages_on_playthrough_id"
    t.check_constraint "time_index >= 0 AND time_index <= 14", name: "conversation_messages_time_index"
  end

  create_table "guests", force: :cascade do |t|
    t.string "token_digest", null: false
    t.datetime "expires_at"
    t.datetime "last_seen_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["token_digest"], name: "index_guests_on_token_digest", unique: true
  end

  create_table "memories", force: :cascade do |t|
    t.bigint "resident_id", null: false
    t.string "fact_key", null: false
    t.text "content", null: false
    t.text "interpretation"
    t.string "source", null: false
    t.integer "acquired_time_index"
    t.bigint "source_event_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["resident_id", "fact_key"], name: "index_memories_on_resident_id_and_fact_key", unique: true
    t.index ["resident_id"], name: "index_memories_on_resident_id"
    t.index ["source_event_id"], name: "index_memories_on_source_event_id"
    t.check_constraint "source::text = ANY (ARRAY['witnessed'::character varying, 'told'::character varying, 'initial'::character varying]::text[])", name: "memories_source"
  end

  create_table "playthroughs", force: :cascade do |t|
    t.bigint "user_id"
    t.bigint "guest_id"
    t.string "mission_key", null: false
    t.string "status", default: "in_progress", null: false
    t.integer "time_index", default: 0, null: false
    t.integer "interventions_used", default: 0, null: false
    t.integer "state_version", default: 0, null: false
    t.integer "festival_progress", default: 0, null: false
    t.string "result"
    t.string "character_key"
    t.string "outfit_key"
    t.float "player_x"
    t.float "player_y"
    t.datetime "position_saved_at"
    t.datetime "saved_at"
    t.datetime "finished_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["guest_id", "mission_key"], name: "index_playthroughs_one_in_progress_per_guest", unique: true, where: "((status)::text = 'in_progress'::text)"
    t.index ["guest_id"], name: "index_playthroughs_on_guest_id"
    t.index ["user_id", "mission_key"], name: "index_playthroughs_one_in_progress_per_user", unique: true, where: "((status)::text = 'in_progress'::text)"
    t.index ["user_id"], name: "index_playthroughs_on_user_id"
    t.check_constraint "(user_id IS NULL) <> (guest_id IS NULL)", name: "playthroughs_one_owner"
    t.check_constraint "interventions_used >= 0 AND interventions_used <= 3", name: "playthroughs_interventions_used"
    t.check_constraint "result IS NULL OR (result::text = ANY (ARRAY['success'::character varying, 'failure'::character varying]::text[]))", name: "playthroughs_result"
    t.check_constraint "state_version >= 0", name: "playthroughs_state_version"
    t.check_constraint "status::text = ANY (ARRAY['in_progress'::character varying, 'shelved'::character varying, 'finished'::character varying, 'abandoned'::character varying]::text[])", name: "playthroughs_status"
    t.check_constraint "time_index >= 0 AND time_index <= 14", name: "playthroughs_time_index"
  end

  create_table "relationships", force: :cascade do |t|
    t.bigint "playthrough_id", null: false
    t.string "from_key", null: false
    t.string "toward_key", null: false
    t.integer "affinity", default: 0, null: false
    t.string "note"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["playthrough_id", "from_key", "toward_key"], name: "index_relationships_on_pair", unique: true
    t.index ["playthrough_id"], name: "index_relationships_on_playthrough_id"
    t.check_constraint "from_key::text <> toward_key::text", name: "relationships_not_self"
  end

  create_table "residents", force: :cascade do |t|
    t.bigint "playthrough_id", null: false
    t.string "key", null: false
    t.string "location_key"
    t.jsonb "current_plan"
    t.integer "plan_time_index"
    t.jsonb "goal_progress", default: {}, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["playthrough_id", "key"], name: "index_residents_on_playthrough_id_and_key", unique: true
    t.index ["playthrough_id"], name: "index_residents_on_playthrough_id"
    t.check_constraint "key::text = ANY (ARRAY['a'::character varying, 'b'::character varying, 'c'::character varying]::text[])", name: "residents_key_in_catalog"
  end

  create_table "time_slot_runs", force: :cascade do |t|
    t.bigint "playthrough_id", null: false
    t.integer "time_index", null: false
    t.string "status", null: false
    t.integer "attempt", default: 1, null: false
    t.integer "base_state_version", null: false
    t.string "suspend_reason"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["playthrough_id", "time_index"], name: "index_time_slot_runs_on_playthrough_id_and_time_index", unique: true
    t.index ["playthrough_id"], name: "index_time_slot_runs_one_running", unique: true, where: "((status)::text = 'running'::text)"
    t.check_constraint "attempt >= 1", name: "time_slot_runs_attempt"
    t.check_constraint "status::text = ANY (ARRAY['running'::character varying, 'confirmed'::character varying, 'suspended'::character varying, 'failed'::character varying]::text[])", name: "time_slot_runs_status"
    t.check_constraint "suspend_reason IS NULL OR (suspend_reason::text = ANY (ARRAY['budget'::character varying, 'network'::character varying, 'unknown_result'::character varying, 'version_mismatch'::character varying]::text[]))", name: "time_slot_runs_suspend_reason"
    t.check_constraint "time_index >= 0 AND time_index <= 14", name: "time_slot_runs_time_index"
  end

  create_table "world_events", force: :cascade do |t|
    t.bigint "playthrough_id", null: false
    t.string "command_id", null: false
    t.string "kind", null: false
    t.string "actor_key"
    t.string "target_key"
    t.integer "time_index", null: false
    t.bigint "cause_id"
    t.string "fact_key"
    t.jsonb "payload", default: {}, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["cause_id"], name: "index_world_events_on_cause_id"
    t.index ["playthrough_id", "command_id"], name: "index_world_events_on_playthrough_id_and_command_id", unique: true
    t.index ["playthrough_id"], name: "index_world_events_on_playthrough_id"
    t.check_constraint "time_index >= 0 AND time_index <= 14", name: "world_events_time_index"
  end

  add_foreign_key "conversation_messages", "playthroughs"
  add_foreign_key "memories", "residents"
  add_foreign_key "memories", "world_events", column: "source_event_id"
  add_foreign_key "playthroughs", "guests"
  add_foreign_key "relationships", "playthroughs"
  add_foreign_key "residents", "playthroughs"
  add_foreign_key "time_slot_runs", "playthroughs"
  add_foreign_key "world_events", "playthroughs"
  add_foreign_key "world_events", "world_events", column: "cause_id"
end
