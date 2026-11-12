module Api
  module V1
    # ゲストの街（#7）。ログインは #16 で作るので、いまはゲストだけ。
    #   POST /api/v1/playthrough  街を始める。同じ Cookie に進行中の街があれば、それを返す（再読み込みで作り直さない）
    #   GET  /api/v1/playthrough  進行中の街の状態。Cookie が無い・知らない・期限切れなら 404
    class PlaythroughsController < ApplicationController
      include GuestSession

      COOKIE = GuestSession::COOKIE

      def create
        guest = current_guest
        token = nil
        guest, token = Guest.issue! unless guest
        playthrough, created = Playthrough.start_for!(guest)
        remember_guest(token) if token
        render json: playthrough.state, status: created ? :created : :ok
      end

      def show
        playthrough = current_playthrough
        return render(json: { error: "not_started" }, status: :not_found) unless playthrough

        render json: playthrough.state
      end
    end
  end
end
