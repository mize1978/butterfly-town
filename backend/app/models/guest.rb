# 登録不要で遊ぶ人。Cookie の値（token）はブラウザにだけ置き、DB にはそのハッシュ（token_digest）だけを保存する
class Guest < ApplicationRecord
  # 保持期間は未決定（ER図「未決定のこと」）。仮に、最後に使ってから30日で期限切れにする
  TTL = 30.days

  has_many :playthroughs, dependent: :restrict_with_exception

  scope :active, -> { where("expires_at IS NULL OR expires_at > ?", Time.current) }

  def self.digest(token) = Digest::SHA256.hexdigest(token)

  # 新しいゲストを作り、Cookie に入れる値を返す（値は DB に残らない）
  def self.issue!
    token = SecureRandom.urlsafe_base64(32)
    guest = create!(token_digest: digest(token), last_seen_at: Time.current, expires_at: TTL.from_now)
    [ guest, token ]
  end

  # Cookie の値から、期限内のゲストを探す。見つからなければ nil
  def self.find_by_token(token)
    return if token.blank?
    active.find_by(token_digest: digest(token))
  end

  def touch_access!
    update_columns(last_seen_at: Time.current, expires_at: TTL.from_now)
  end
end
