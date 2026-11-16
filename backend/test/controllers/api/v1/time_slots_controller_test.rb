require "test_helper"
require "minitest/mock"

# #8 POST /api/v1/playthrough/time_slots。コントローラは受け付けと結果の返却だけ（処理は TimeSlotProcessor）
class Api::V1::TimeSlotsControllerTest < ActionDispatch::IntegrationTest
  def confirm(time_index) = post(api_v1_playthrough_time_slots_path, params: { time_index: time_index }, as: :json)
  def body = response.parsed_body

  test "ゲストの街がなければ 404" do
    confirm(0)
    assert_response :not_found
  end

  test "いまの時間帯を確定すると、次の時間帯の状態と、その時間帯の出来事を返す" do
    post api_v1_playthrough_path
    confirm(0)
    assert_response :ok
    confirm(1)
    assert_response :ok
    assert_equal 2, body.dig("state", "time_index")
    assert_equal({ "time_index" => 1, "status" => "confirmed", "attempt" => 1 }, body["time_slot"].slice("time_index", "status", "attempt"))
    assert_equal [ %w[consulted a c], %w[told c a] ], body.dig("time_slot", "events").map { _1.values_at("kind", "actor_key", "target_key") }.sort
  end

  test "同じ時間帯を2回送ると、2回目は確定済みとして同じ出来事を返し、増やさない" do
    post api_v1_playthrough_path
    confirm(0)
    confirm(1)
    first = body.dig("time_slot", "events")
    assert_no_difference -> { WorldEvent.count } do
      confirm(1)
    end
    assert_response :ok
    assert_equal "confirmed", body.dig("time_slot", "status")
    assert_equal first, body.dig("time_slot", "events")
  end

  test "いまと違う時間帯は 409" do
    post api_v1_playthrough_path
    confirm(5)
    assert_response :conflict
    assert_equal "time_index_mismatch", body["error"]
  end

  test "予算が足りずに止めたときは 409 で、理由 budget と再開できる時期を返す。時間帯は進まない" do
    post api_v1_playthrough_path
    resume = ActiveSupport::TimeZone["Asia/Tokyo"].local(2026, 12, 1) # 予算の月の区切りは日本時間
    stopped = Class.new do
      define_method(:initialize) { |pt| @pt = pt }
      define_method(:call) do |time_index:|
        run = TimeSlotRun.create!(playthrough: @pt, time_index: time_index, status: "suspended", suspend_reason: "budget", base_state_version: 0)
        TimeSlotProcessor::Result.new(status: :suspended, run: run, events: [], rejected: [], error: "budget", resume_at: resume)
      end
    end
    TimeSlotProcessor.stub(:new, ->(pt, **) { stopped.new(pt) }) { confirm(0) }
    assert_response :conflict
    assert_equal [ "budget", "2026-12-01T00:00:00+09:00", 0 ], [ body["error"], body["resume_at"], body.dig("state", "time_index") ]
    assert_equal "suspended", body.dig("time_slot", "status")
  end

  test "time_index が無い・数でないときは 422" do
    post api_v1_playthrough_path
    post api_v1_playthrough_time_slots_path, params: { time_index: "x" }, as: :json
    assert_response :unprocessable_content
  end
end
