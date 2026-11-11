module Api
  module V1
    # POST /api/v1/playthrough/time_slots  { time_index: n }  いまの時間帯を1つ確定する（#8）。
    # 受け付けと結果の返却だけを行い、処理は TimeSlotProcessor に任せる
    class TimeSlotsController < ApplicationController
      include GuestSession

      STATUS = { confirmed: :ok, already_confirmed: :ok, suspended: :conflict, discarded: :conflict, conflict: :conflict }.freeze

      def create
        playthrough = current_playthrough || finished_playthrough
        return render(json: { error: "not_started" }, status: :not_found) unless playthrough

        time_index = Integer(params.require(:time_index), exception: false)
        return render(json: { error: "invalid_time_index" }, status: :unprocessable_content) unless time_index

        result = TimeSlotProcessor.new(playthrough).call(time_index: time_index)
        render json: body(playthrough.reload, result), status: STATUS.fetch(result.status)
      end

      private

      # 最後の時間帯を確定した直後の再送（二度押し）にも、確定済みとして答えられるように、終わった街も探す
      def finished_playthrough
        current_guest&.playthroughs&.where(status: "finished", mission_key: Playthrough::MISSION)&.order(:finished_at)&.last
      end

      def body(playthrough, result)
        json = { state: playthrough.state }
        json[:error] = result.error if result.error
        if result.run
          json[:time_slot] = {
            time_index: result.run.time_index, status: result.run.status, attempt: result.run.attempt,
            events: result.events.map { _1.slice(:kind, :actor_key, :target_key, :fact_key, :payload) },
            rejected: result.rejected
          }
        end
        json
      end
    end
  end
end
