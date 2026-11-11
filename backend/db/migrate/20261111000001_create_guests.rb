# ゲスト（登録不要で遊ぶ人）。Cookie の値そのものは保存せず、ハッシュだけを持つ
class CreateGuests < ActiveRecord::Migration[8.1]
  def change
    create_table :guests do |t|
      t.string :token_digest, null: false, index: { unique: true }
      t.datetime :expires_at # 保持期間の値は未決定
      t.datetime :last_seen_at
      t.timestamps
    end
  end
end
