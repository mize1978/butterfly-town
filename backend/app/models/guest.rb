# 登録不要で遊ぶ人。Cookie の値はハッシュ（token_digest）だけを保存する
class Guest < ApplicationRecord
  has_many :playthroughs, dependent: :restrict_with_exception
end
