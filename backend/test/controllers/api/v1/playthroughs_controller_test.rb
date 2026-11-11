require "test_helper"

# #7 ゲストで街を始める。Cookie には推測できない値、DB にはそのハッシュだけを置く。
# 同じブラウザ（同じ Cookie）なら、進行中の街をそのまま使う
class Api::V1::PlaythroughsControllerTest < ActionDispatch::IntegrationTest
  COOKIE = Api::V1::PlaythroughsController::COOKIE.to_s

  def start = post(api_v1_playthrough_path)
  def body = response.parsed_body

  test "初回の開始でゲストと街と住民3人ができ、Cookie には値、DB にはハッシュだけが入る" do
    assert_difference -> { Guest.count } => 1, -> { Playthrough.count } => 1, -> { Resident.count } => 3 do
      start
    end
    assert_response :created
    token = cookies[COOKIE]
    assert token.present?
    assert_operator token.size, :>=, 40, "推測できない長さの値"
    guest = Guest.sole
    refute_equal token, guest.token_digest, "Cookie の値そのものは DB に置かない"
    assert_equal Digest::SHA256.hexdigest(token), guest.token_digest
    assert_equal guest, Playthrough.sole.guest
  end

  test "開始直後の状態：時間帯0・進捗0・介入は3回残り・住民3人が最初の場所にいる" do
    start
    assert_equal 0, body["time_index"]
    assert_equal 15, body["time_slots"]
    assert_equal 0, body["festival_progress"]
    assert_equal 3, body["interventions_left"]
    assert_equal "in_progress", body["status"]
    assert_equal ResidentCatalog.all.map { { "key" => _1.fetch("key"), "location_key" => _1.fetch("location") } },
                 body["residents"]
  end

  test "同じ Cookie でもう一度開始しても（再読み込み）、新しい街は作らず進行中の街を返す" do
    start
    pt = Playthrough.sole
    pt.update_columns(time_index: 4, interventions_used: 1)
    assert_no_difference -> { Guest.count + Playthrough.count + Resident.count } do
      start
    end
    assert_response :ok
    assert_equal [ 4, 2 ], body.values_at("time_index", "interventions_left")
  end

  test "GET は同じ Cookie の進行中の街の状態を返す" do
    start
    Playthrough.sole.update_columns(time_index: 2, festival_progress: 30)
    get api_v1_playthrough_path
    assert_response :ok
    assert_equal [ 2, 30 ], body.values_at("time_index", "festival_progress")
  end

  test "Cookie なしの GET は 404 で、ゲストも街も作らない" do
    assert_no_difference -> { Guest.count + Playthrough.count } do
      get api_v1_playthrough_path
    end
    assert_response :not_found
    assert_equal "not_started", body["error"]
  end

  test "知らない（推測・改ざんした）Cookie の GET は 404 で、Cookie を消す" do
    start
    cookies[COOKIE] = SecureRandom.urlsafe_base64(32)
    get api_v1_playthrough_path
    assert_response :not_found
    assert cookies[COOKIE].blank?, "使えない Cookie は消す"
  end

  test "別のゲストの Cookie では、その人の街しか見えない" do
    start
    mine = cookies[COOKIE]
    Playthrough.sole.update_columns(time_index: 5)
    cookies.delete(COOKIE)
    start # 別のブラウザ＝別のゲスト
    assert_equal 0, body["time_index"]
    assert_equal 2, Guest.count
    cookies[COOKIE] = mine
    get api_v1_playthrough_path
    assert_equal 5, body["time_index"]
  end

  test "期限切れのゲストは GET が 404。開始すると新しいゲストと街になり、古い街には触らない" do
    start
    expired = cookies[COOKIE]
    old = Playthrough.sole
    old.guest.update_columns(expires_at: 1.minute.ago)
    get api_v1_playthrough_path
    assert_response :not_found
    assert cookies[COOKIE].blank?, "期限切れの Cookie は消す"
    cookies[COOKIE] = expired # 消される前の値のまま開始しても、期限切れのゲストは使わない
    start
    assert_response :created
    assert_equal 2, Guest.count
    refute_equal old.id, Playthrough.where(status: "in_progress").order(:id).last.id
    assert_equal "in_progress", old.reload.status, "古い街は消さず、書き換えない"
  end

  test "使うたびに期限が延びる" do
    start
    guest = Guest.sole
    guest.update_columns(expires_at: 1.day.from_now)
    get api_v1_playthrough_path
    assert_operator guest.reload.expires_at, :>, 29.days.from_now
  end

  test "終わった街しかないゲストが開始すると、新しい街を作る" do
    start
    Playthrough.sole.update_columns(status: "finished", result: "success")
    start
    assert_response :created
    assert_equal 2, Playthrough.where(guest: Guest.sole).count
  end
end
