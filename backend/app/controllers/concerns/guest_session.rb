# ゲストの Cookie（#7）。値はブラウザにだけ置き、DB にはそのハッシュだけを保存する
module GuestSession
  extend ActiveSupport::Concern
  include ActionController::Cookies

  COOKIE = :guest_token

  private

  # Cookie の値から期限内のゲストを探し、使った印に期限を延ばす。使えない Cookie は消す
  def current_guest
    return @current_guest if defined?(@current_guest)

    token = cookies[COOKIE]
    @current_guest = Guest.find_by_token(token)
    if @current_guest
      @current_guest.touch_access!
      remember_guest(token)
    elsif token
      cookies.delete(COOKIE)
    end
    @current_guest
  end

  def current_playthrough = current_guest && Playthrough.current_for(current_guest)

  def remember_guest(token)
    cookies[COOKIE] = { value: token, expires: Guest::TTL.from_now, httponly: true, same_site: :lax,
                        secure: Rails.env.production? }
  end
end
