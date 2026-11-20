# ログイン中の端末（#16）。Cookie には署名つきのこの行の id だけを置き、ログアウトで行を消す。
# 最後に使ってから TTL を過ぎたセッションは使わない（使うたびに updated_at を更新して延ばす）
class Session < ApplicationRecord
  TTL = 30.days # 仮の値。ゲストの保持期間（Guest::TTL）にそろえた

  belongs_to :user

  scope :active, -> { where(updated_at: TTL.ago..) }
end
