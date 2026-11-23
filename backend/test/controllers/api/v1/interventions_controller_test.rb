require "test_helper"

# #33 POST /api/v1/playthrough/interventions。コントローラは受け付けと結果の返却だけ（処理は Intervention）
class Api::V1::InterventionsControllerTest < ActionDispatch::IntegrationTest
  def intervene(**params) = post(api_v1_playthrough_interventions_path, params: params, as: :json)
  def body = response.parsed_body

  test "ゲストの街がなければ 404" do
    intervene(kind: "rumor", request_id: "x", target: "a", fact_key: "e2")
    assert_response :not_found
  end

  test "成立は 201 で、残り回数の減った状態と介入の出来事を返す。同じ送信の再送は 200 で同じ出来事" do
    post api_v1_playthrough_path
    intervene(kind: "gathering", request_id: "g-1", place: "shop")
    assert_response :created
    assert_equal 2, body.dig("state", "interventions_left")
    assert_equal [ "gathering_announced", "player", 0 ], body["event"].values_at("kind", "actor_key", "time_index")
    assert_equal({ "place" => "shop", "at" => 1 }, body.dig("event", "payload").slice("place", "at"))

    first = body["event"]
    intervene(kind: "gathering", request_id: "g-1", place: "shop")
    assert_response :ok
    assert_equal first, body["event"]
    assert_equal 2, body.dig("state", "interventions_left")
  end

  test "4回目は 409 no_interventions_left で、残り0の状態を返す。入力の誤りは 422" do
    post api_v1_playthrough_path
    3.times { intervene(kind: "rumor", request_id: "r-#{_1}", target: "a", fact_key: "e1") }
    intervene(kind: "rumor", request_id: "r-4", target: "a", fact_key: "e1")
    assert_response :conflict
    assert_equal [ "no_interventions_left", 0 ], [ body["error"], body.dig("state", "interventions_left") ]

    intervene(kind: "rumor", request_id: "r-5", target: "a", fact_key: "e9")
    assert_response :unprocessable_content
    assert_equal "invalid_fact", body["error"]
  end
end
