module Api
  module V1
    # POST /api/v1/playthrough/interventions  特殊介入（#33）。受け付けと結果の返却だけを行い、処理は Intervention に任せる。
    #   { kind: "rumor", request_id:, target: "a", fact_key: "e2" }  うわさを流す
    #   { kind: "gathering", request_id:, place: "plaza" }           集まる場を作る
    # 成立 201・同じ送信の再送 200（どちらも state と出来事）。断ったとき 409（error と state）。入力の誤り 422
    class InterventionsController < ApplicationController
      include GuestSession

      STATUS = { applied: :created, already_applied: :ok, conflict: :conflict, invalid: :unprocessable_content }.freeze

      def create
        playthrough = current_playthrough
        return render(json: { error: "not_started" }, status: :not_found) unless playthrough

        result = Intervention.new(playthrough).call(kind: params[:kind], request_id: params[:request_id], target: params[:target],
                                                    fact_key: params[:fact_key], place: params[:place])
        json = { state: playthrough.reload.state }
        json[:error] = result.error if result.error
        json[:event] = result.event.slice(:kind, :actor_key, :target_key, :fact_key, :time_index, :payload) if result.event
        render json: json, status: STATUS.fetch(result.status)
      end
    end
  end
end
