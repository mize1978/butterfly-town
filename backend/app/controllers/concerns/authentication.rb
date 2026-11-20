# ログインの Cookie（#16）。Rails 8 の認証の雛形を、API（JSON）用に直したもの。
# Cookie には署名つきのセッションの id だけを置く（改ざんすると読めない）。セッションの本体は DB の sessions。
# 期限は最後に使ってから Session::TTL（30日）。使うたびに DB の行と Cookie の期限を延ばす。
# ゲストの Cookie（guest_token・GuestSession）とは別に持ち、ログイン・ログアウトしてもゲストの街はそのまま残す。
# いまはログインが必要な API が無いので、ログインを必須にする before_action は付けない。
# 登録・ログイン・ログアウトは、他サイトからの要求を拒否する（reject_cross_site_request）
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

  # ログイン・登録が成功したときに呼ぶ。この端末に前のセッションがあれば、それだけを消してから作る
  # （共用の端末で前の人のセッションを残さない。ほかの端末のセッションは残す）
  def start_new_session_for(user)
    id = cookies.signed[COOKIE]
    Session.where(id: id).destroy_all if id
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

  # 他サイトからの登録・ログイン・ログアウトを拒否する（login CSRF の対策）。
  # 正規の画面は同じオリジンから JSON で送る。他サイトのフォームは JSON を送れず、他サイトの fetch で JSON を送るには
  # CORS の許可が要る（このアプリは CORS を許可していない）。さらに、ブラウザが付ける Sec-Fetch-Site が同じオリジン以外を示すか、
  # Sec-Fetch-Site の無い古いブラウザで Origin が別のサイトなら拒否する
  def reject_cross_site_request
    return if same_origin_json_request?

    # どのチェックで拒否したかを残す（値はブラウザが付けたヘッダーと、Rails が自分の URL とみなしたものだけ）
    Rails.logger.warn("[auth] cross_site_request rejected: media_type=#{request.media_type.inspect} " \
                      "sec_fetch_site=#{request.headers['Sec-Fetch-Site'].inspect} origin=#{request.headers['Origin'].inspect} " \
                      "base_url=#{request.base_url.inspect}")
    render json: { error: "cross_site_request" }, status: :forbidden
  end

  def same_origin_json_request?
    return false unless request.media_type == "application/json"

    site = request.headers["Sec-Fetch-Site"]
    return %w[same-origin none].include?(site) if site.present?

    origin = request.headers["Origin"]
    origin.blank? || origin == request.base_url
  end

  # 回数制限で数えるアクセス元（#35）。接続元（REMOTE_ADDR）が信頼できる中継（Render の振り分け・Cloudflare）のときだけ、
  # X-Forwarded-For から利用者の IP を取る（request.remote_ip）。それ以外の接続は X-Forwarded-For を使わず、接続元そのもので数える。
  # Rails の remote_ip は接続元が信頼できない場合も X-Forwarded-For を先に見るため、Cloudflare を通らずに届いた接続が
  # X-Forwarded-For を書き換えて数え方をずらせないようにする
  def client_ip
    trusted_proxy?(request.remote_addr) ? request.remote_ip : request.remote_addr
  end

  def trusted_proxy?(ip)
    addr = IPAddr.new(ip.to_s)
    Rails.application.config.action_dispatch.trusted_proxies.any? { |range| range.include?(addr) }
  rescue IPAddr::InvalidAddressError
    false
  end

  # 本番の経路の確認用（#35）。IP そのものは書かず、接続元と X-Forwarded-For の各段が「社内向け・Cloudflare・その他」の
  # どれかと、どちらで数えたかだけを残す
  def log_client_ip_route
    kinds = request.x_forwarded_for.to_s.split(",").map { ip_kind(_1.strip) }
    Rails.logger.info("[auth] client_ip route: remote_addr=#{ip_kind(request.remote_addr)} forwarded=#{kinds.inspect} " \
                      "counted_by=#{trusted_proxy?(request.remote_addr) ? 'forwarded' : 'remote_addr'}")
  end

  def ip_kind(ip)
    addr = IPAddr.new(ip.to_s)
    return "private" if ActionDispatch::RemoteIp::TRUSTED_PROXIES.any? { _1.include?(addr) }

    trusted_proxy?(ip) ? "cloudflare" : "other"
  rescue IPAddr::InvalidAddressError
    "invalid"
  end

  def user_json(user) = { user: user && { email: user.email } }
end
