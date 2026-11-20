# 登録したプレイヤー（#16）。Rails 8 の認証の雛形（users・sessions）から作った。
# パスワードは bcrypt のハッシュ（password_digest）だけを保存する
class User < ApplicationRecord
  PASSWORD_MIN = 8 # 仮の値（RUNTEQ の課題でよく使う長さ）。上限は bcrypt の 72 バイト（has_secure_password が確かめる）

  has_secure_password
  has_many :sessions, dependent: :destroy

  normalizes :email, with: ->(e) { e.strip.downcase }

  validates :email, presence: true, uniqueness: true
  validates :email, format: { with: URI::MailTo::EMAIL_REGEXP }, allow_blank: true
  validates :password, length: { minimum: PASSWORD_MIN }, allow_nil: true
end
