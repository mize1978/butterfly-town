# 他サイトからの要求を拒否する（CSRF の対策）。登録・ログイン・ログアウト（#16）と特殊介入（#33）で使う。
# 正規の画面は同じオリジンから JSON で送る。他サイトのフォームは JSON を送れず、他サイトの fetch で JSON を送るには
# CORS の許可が要る（このアプリは CORS を許可していない）。さらに、ブラウザが付ける Sec-Fetch-Site が同じオリジン以外を示すか、
# Sec-Fetch-Site の無い古いブラウザで Origin が別のサイトなら拒否する
module SameOriginRequest
  extend ActiveSupport::Concern

  private

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
end
