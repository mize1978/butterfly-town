module Api
  module V1
    # ログイン・ログアウト（#16）
    #   GET    /api/v1/session  いまログインしているユーザー。していなければ { user: null }
    #   POST   /api/v1/session  メールアドレスとパスワードでログインする。違えば 401（どちらが違うかは返さない）
    #   DELETE /api/v1/session  この端末のログインを終える（ログインしていなくても 204）
    class SessionsController < ApplicationController
      include Authentication

      before_action :log_request_route, only: :create
      before_action :reject_cross_site_request, only: %i[create destroy]
      rate_limit to: 10, within: 3.minutes, only: :create, by: -> { client_ip }, with: -> { render json: { error: "rate_limited" }, status: :too_many_requests }

      def show
        render json: user_json(resume_session&.user)
      end

      def create
        user = User.authenticate_by(email: params[:email].to_s, password: params[:password].to_s)
        return render(json: { error: "invalid_credentials" }, status: :unauthorized) unless user

        start_new_session_for(user)
        render json: user_json(user)
      end

      def destroy
        terminate_session
        head :no_content
      end
    end
  end
end
