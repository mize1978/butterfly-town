require "test_helper"

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

  test "time_index が無い・数でないときは 422" do
    post api_v1_playthrough_path
    post api_v1_playthrough_time_slots_path, params: { time_index: "x" }, as: :json
    assert_response :unprocessable_content
  end
end
