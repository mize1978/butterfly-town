# 通常会話の発言。ai_calls は #10 で作るので、いまは ai_call_id の列だけ
class ConversationMessage < ApplicationRecord
  belongs_to :playthrough
end
