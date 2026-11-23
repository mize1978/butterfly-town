# テストのカバレッジ（どの行がテストで通ったか）。CI では結果を coverage/ に残す。
# 目標値は README の「テスト」に書く。今は測るだけで、下回ってもテストを失敗にしない
require "simplecov"
SimpleCov.start "rails" do
  enable_coverage :branch
  skip "/test/"
  # 目標（行80%）はサービス層で見る。HTML の結果では「サービス層」のタブに出る
  add_group "サービス層", "app/services"
end

ENV["RAILS_ENV"] ||= "test"
require_relative "../config/environment"
require "rails/test_help"
require_relative "support/test_data"

module ActiveSupport
  class TestCase
    # Run tests in parallel with specified workers
    parallelize(workers: 1)

    # Setup all fixtures in test/fixtures/*.yml for all tests in alphabetical order.
    fixtures :all

    # テストデータの作り方（ゲスト・街・住民・記憶・時間帯の処理・AI 呼び出し）は test/support/test_data.rb（#47）
    include TestData
  end
end
