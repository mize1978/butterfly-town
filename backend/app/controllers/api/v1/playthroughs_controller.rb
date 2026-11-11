module Api
  module V1
    # ゲストの街（#7）。ログインは #16 で作るので、いまはゲストだけ。
    #   POST /api/v1/playthrough  街を始める。同じ Cookie に進行中の街があれば、それを返す（再読み込みで作り直さない）
    #   GET  /api/v1/playthrough  進行中の街の状態。Cookie が無い・知らない・期限切れなら 404
    class PlaythroughsController < ApplicationController
      include ActionController::Cookies

      COOKIE = :guest_token

      def create
        guest = current_guest
        token = nil
        guest, token = Guest.issue! unless guest
        playthrough, created = Playthrough.start_for!(guest)
        remember(token) if token
        render json: playthrough.state, status: created ? :created : :ok
      end

      def show
        guest = current_guest
        playthrough = guest && Playthrough.current_for(guest)
        return render(json: { error: "not_started" }, status: :not_found) unless playthrough

        render json: playthrough.state
      end

      private

      # Cookie の値から期限内のゲストを探し、使った印に期限を延ばす。使えない Cookie は消す
      def current_guest
        token = cookies[COOKIE]
        guest = Guest.find_by_token(token)
        if guest
          guest.touch_access!
          remember(token)
        elsif token
          cookies.delete(COOKIE)
        end
        guest
      end

      def remember(token)
        cookies[COOKIE] = { value: token, expires: Guest::TTL.from_now, httponly: true, same_site: :lax,
                            secure: Rails.env.production? }
      end
    end
  end
end
