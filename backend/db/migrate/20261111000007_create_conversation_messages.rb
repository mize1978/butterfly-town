# 通常会話の発言。発言そのものは出来事（world_events）として扱わない。
# ai_calls は #10 で作るので、ai_call_id の外部キーはそのときに足す
class CreateConversationMessages < ActiveRecord::Migration[8.1]
  def change
    create_table :conversation_messages do |t|
      t.references :playthrough, null: false, foreign_key: true
      t.integer :time_index, null: false
      t.string :speaker_key, null: false
      t.string :listener_key, null: false
      t.text :body, null: false
      t.bigint :ai_call_id, index: true
      t.timestamps

      t.check_constraint "time_index BETWEEN 0 AND 14", name: "conversation_messages_time_index"
    end
  end
end
