# ログインの Cookie（#16）。Rails 8 の認証の雛形を、API（JSON）用に直したもの。
# Cookie には署名つきのセッションの id だけを置く（改ざんすると読めない）。セッションの本体は DB の sessions。
# 期限は最後に使ってから Session::TTL（30日）。使うたびに DB の行と Cookie の期限を延ばす。
# ゲストの Cookie（guest_token・GuestSession）とは別に持ち、ログイン・ログアウトしてもゲストの街はそのまま残す。
# いまはログインが必要な API が無いので、ログインを必須にする before_action は付けない。
# 登録・ログイン・ログアウトは、他サイトからの要求を拒否する（reject_cross_site_request。中身は SameOriginRequest）
module Authentication
  extend ActiveSupport::Concern
  include ActionController::Cookies
  include SameOriginRequest

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

  # 本番の経路の確認用（#35）。Rails に直接つながる中継（REMOTE_ADDR）と、転送ヘッダーの各段の「種類」と「位置」、
  # 回数制限をどちらで数えたか（counted_by）だけを残す。IP そのもの（一部も）は書かない
  #   remote_addr / forwarded … loopback・private（社内向け）・link_local・cgnat（100.64/10）・cloudflare（公開範囲）・other・invalid
  #   cf_connecting_ip など … 値が X-Forwarded-For の右から何番目（forwarded[-N]）か、接続元（remote_addr）と同じか、どこにも無い（unmatched）か、無い（absent）か
  #   remote_ip … いまの Rails の既定（request.remote_ip）がどの位置の値を選んだか
  ROUTE_HEADERS = { cf_connecting_ip: "CF-Connecting-IP", x_real_ip: "X-Real-IP", true_client_ip: "True-Client-IP", client_ip_header: "Client-Ip" }.freeze
  IP_KINDS = {
    loopback: %w[127.0.0.0/8 ::1],
    private: %w[10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 fc00::/7],
    link_local: %w[169.254.0.0/16 fe80::/10],
    cgnat: %w[100.64.0.0/10],
    cloudflare: YAML.safe_load_file(Rails.root.join("config/cloudflare_ips.yml")).values.flatten
  }.transform_values { |ranges| ranges.map { IPAddr.new(_1) } }.freeze

  def log_request_route
    forwarded = request.x_forwarded_for.to_s.split(",").map(&:strip)
    fields = { remote_addr: ip_kind(request.remote_addr), forwarded: forwarded.empty? ? "none" : forwarded.map { ip_kind(_1) }.join(",") }
    ROUTE_HEADERS.each { |key, name| fields[key] = route_position(request.headers[name], forwarded) }
    fields[:forwarded_header] = request.headers["Forwarded"].present? ? "present" : "absent"
    fields[:cf_ray] = request.headers["CF-Ray"].present? ? "present" : "absent"
    fields[:remote_ip] = route_position(request.remote_ip, forwarded)
    fields[:counted_by] = render_route_client ? "render_route" : "remote_addr"
    Rails.logger.info("[auth] request route: #{fields.map { |k, v| "#{k}=#{v}" }.join(' ')}")
  rescue StandardError => e # 診断の失敗で登録・ログインを止めない
    Rails.logger.warn("[auth] request route: failed #{e.class}")
  end

  # 回数制限で数えるアクセス元（#35）。本番の経路は #57 の診断ログ（2026-11-22、登録とログインの2件）で確かめた次の形だけ：
  #   REMOTE_ADDR＝ループバック、X-Forwarded-For の右から「社内向けの中継」「Cloudflare の拠点」「利用者」、
  #   CF-Connecting-IP＝右から3番目と同じ
  # この形のときだけ右から3番目（Cloudflare が書き足した利用者）で数える。左に足された値・Forwarded・Client-Ip は見ない。
  # 形が違えば（経路が変わった・直接届いたなど）転送ヘッダーを使わず、直接の接続元（REMOTE_ADDR）で数える
  def client_ip
    render_route_client || request.remote_addr
  end

  def render_route_client
    return unless ip_kind(request.remote_addr) == :loopback

    hops = request.x_forwarded_for.to_s.split(",").map(&:strip)
    return unless hops.size >= 3 && ip_kind(hops[-1]) == :private && ip_kind(hops[-2]) == :cloudflare

    client = hops[-3]
    client if ip_kind(client) != :invalid && request.headers["CF-Connecting-IP"].to_s.strip == client
  end

  def route_position(value, forwarded)
    return "absent" if value.blank?

    value = value.to_s.strip
    index = forwarded.rindex(value)
    return "forwarded[-#{forwarded.size - index}]" if index
    value == request.remote_addr.to_s ? "remote_addr" : "unmatched"
  end

  def ip_kind(ip)
    addr = IPAddr.new(ip.to_s)
    IP_KINDS.find { |_, ranges| ranges.any? { _1.include?(addr) } }&.first || :other
  rescue IPAddr::InvalidAddressError
    :invalid
  end

  def user_json(user) = { user: user && { email: user.email } }
end
