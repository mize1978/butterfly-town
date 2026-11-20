# いまのリクエストのセッション（#16）。ログインしていなければ session も user も nil
class Current < ActiveSupport::CurrentAttributes
  attribute :session
  delegate :user, to: :session, allow_nil: true
end
