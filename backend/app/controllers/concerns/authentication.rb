# ログインの Cookie（#16）。Rails 8 の認証の雛形を、API（JSON）用に直したもの。
# Cookie には署名つきのセッションの id だけを置く（改ざんすると読めない）。セッションの本体は DB の sessions。
# 期限は最後に使ってから Session::TTL（30日）。使うたびに DB の行と Cookie の期限を延ばす。
# ゲストの Cookie（guest_token・GuestSession）とは別に持ち、ログイン・ログアウトしてもゲストの街はそのまま残す。
# いまはログインが必要な API が無いので、ログインを必須にする before_action は付けない
module Authentication
  extend ActiveSupport::Concern
  include ActionController::Cookies

  COOKIE = :session_id

  private

  def resume_session
    Current.session ||= find_session_by_cookie
  end

  # 期限内のセッションなら使った印に期限を延ばす。使えない Cookie（期限切れ・消えた・改ざん）は消す
  def find_session_by_cookie
    return unless cookies[COOKIE]

    session = (id = cookies.signed[COOKIE]) && Session.active.find_by(id: id)
    if session
      session.touch
      remember_session(session)
    else
      cookies.delete(COOKIE)
    end
    session
  end

  def remember_session(session)
    cookies.signed[COOKIE] = { value: session.id, expires: Session::TTL.from_now, httponly: true, same_site: :lax, secure: Rails.env.production? }
  end

  def start_new_session_for(user)
    user.sessions.create!(user_agent: request.user_agent, ip_address: request.remote_ip).tap do |session|
      Current.session = session
      remember_session(session)
    end
  end

  # この端末のセッションだけを消す（ほかの端末のログインは残す）
  def terminate_session
    resume_session&.destroy
    Current.session = nil
    cookies.delete(COOKIE)
  end

  def user_json(user) = { user: user && { email: user.email } }
end
