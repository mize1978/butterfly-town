# 誘いとその返事（#55）。どちらも出来事（world_events）から読む。誘いは invited、返事は accepted / declined で、
# 返事の cause_id が元の誘いを指す。状態は pending（未回答）・accepted（受けた）・declined（断った）
class Invitations
  Invite = Struct.new(:event, :from, :to, :task, :status, keyword_init: true)
  REPLY_KINDS = %w[accepted declined].freeze

  def initialize(playthrough)
    events = playthrough.world_events.where(kind: [ "invited", *REPLY_KINDS ]).order(:id).to_a
    replies = events.select { REPLY_KINDS.include?(_1.kind) }.index_by(&:cause_id)
    @all = events.select { _1.kind == "invited" }.map do |e|
      Invite.new(event: e, from: e.actor_key, to: e.target_key, task: e.payload.dig("params", "task"),
                 status: replies[e.id]&.kind || "pending")
    end
  end

  def to(key) = @all.select { _1.to == key }
  def from(key) = @all.select { _1.from == key }
  def pending_to(key) = to(key).select { _1.status == "pending" }
  def accepted_to(key) = to(key).select { _1.status == "accepted" }

  # 返事が向かう誘い（自分宛て・相手から・同じ task・未回答）
  def pending_from(from:, to:, task:) = pending_to(to).find { _1.from == from && _1.task == task }
end
