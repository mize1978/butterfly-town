require "test_helper"
require "rake"

# bin/rails ai_budget:status の表示（#10・#29）。月の区切りは日本時間なので、月の表記も日本時間と書く
class AiBudgetRakeTest < ActiveSupport::TestCase
  setup do
    Rails.application.load_tasks unless Rake::Task.task_defined?("ai_budget:status")
    Rake::Task["ai_budget:status"].reenable
  end

  test "月は日本時間で数えるので、表示も「（日本時間）」と書く。UTC とは書かない" do
    travel_to Time.utc(2026, 11, 30, 15, 0, 0) do # 日本時間では 12月1日 0:00
      out, = capture_io { Rake::Task["ai_budget:status"].invoke }
      assert_includes out, "2026-12（日本時間）"
      assert_not_includes out, "UTC"
    end
  end
end
