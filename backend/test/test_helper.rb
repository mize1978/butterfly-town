# テストのカバレッジ（どの行がテストで通ったか）。CI では結果を coverage/ に残す。
# 目標値は README の「テスト」に書く。今は測るだけで、下回ってもテストを失敗にしない
require "simplecov"
SimpleCov.start "rails" do
  enable_coverage :branch
  skip "/test/"
end

ENV["RAILS_ENV"] ||= "test"
require_relative "../config/environment"
require "rails/test_help"

module ActiveSupport
  class TestCase
    # Run tests in parallel with specified workers
    parallelize(workers: 1)

    # Setup all fixtures in test/fixtures/*.yml for all tests in alphabetical order.
    fixtures :all

    # Add more helper methods to be used by all tests here...
  end
end
