module Api
  module V1
    # 登録（#16）。Rails 8 の認証の雛形には登録が無いので足した。
    #   POST /api/v1/registration  メールアドレス・パスワード（・確認用）で登録し、そのままログインする。
    #   入力に問題があれば 422 で、項目ごとの理由（blank・invalid・taken・too_short など）を返す。文言は画面側で決める
    class RegistrationsController < ApplicationController
      include Authentication

      before_action :reject_cross_site_request, only: :create
      rate_limit to: 10, within: 3.minutes, only: :create, with: -> { render json: { error: "rate_limited" }, status: :too_many_requests }

      def create
        user = User.new(params.permit(:email, :password, :password_confirmation))
        return render(json: { errors: reasons(user) }, status: :unprocessable_entity) unless user.save

        start_new_session_for(user)
        render json: user_json(user), status: :created
      rescue ActiveRecord::RecordNotUnique # 同時に同じメールアドレスで登録したとき（一意の確認をすり抜けた分）
        render json: { errors: { email: [ "taken" ] } }, status: :unprocessable_entity
      end

      private

      def reasons(user) = user.errors.details.transform_values { |list| list.map { _1[:error].to_s }.uniq }
    end
  end
end
