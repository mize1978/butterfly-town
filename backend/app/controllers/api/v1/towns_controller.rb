module Api
  module V1
    # 街の地図の定義を返す。今は街が1つだけなので、ID を受け取らずに現在の街を返す
    class TownsController < ApplicationController
      def show
        render json: TownMap.current
      end
    end
  end
end
