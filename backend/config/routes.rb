Rails.application.routes.draw do
  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  get "up" => "rails/health#show", as: :rails_health_check

  namespace :api do
    namespace :v1 do
      resource :town, only: :show
      resource :session, only: %i[show create destroy] # ログイン・ログアウト（#16）
      resource :registration, only: :create # 登録（#16）
      resource :playthrough, only: %i[show create] do
        resources :time_slots, only: :create
        resources :interventions, only: :create # 特殊介入（#33）
      end
    end
  end
end
