# #6 で列だけ作った conversation_messages.ai_call_id に、ai_calls ができたので外部キーを足す
class AddAiCallForeignKeyToConversationMessages < ActiveRecord::Migration[8.1]
  def change
    add_foreign_key :conversation_messages, :ai_calls
  end
end
