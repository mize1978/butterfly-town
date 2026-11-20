require "test_helper"

# #16 ログイン・ログアウト。Cookie には署名つきのセッションの番号だけを置き、セッションは DB の sessions に残す
class Api::V1::SessionsControllerTest < ActionDispatch::IntegrationTest
  def login(email = "one@example.com", password = "password123")
    post api_v1_session_path, params: { email: email, password: password }, as: :json
  end

  def body = response.parsed_body

  test "正しいパスワードでログインでき、セッションが DB にでき、Cookie が入る" do
    assert_difference -> { Session.count }, 1 do
      login(" ONE@example.com ")
    end
    assert_response :ok
    assert_equal({ "user" => { "email" => "one@example.com" } }, body)
    assert cookies["session_id"].present?
    refute_equal Session.last.id.to_s, cookies["session_id"], "Cookie の値は id そのものではなく署名つき"
    assert_equal users(:one), Session.last.user

    get api_v1_session_path
    assert_equal({ "user" => { "email" => "one@example.com" } }, body)
  end

  test "誤ったパスワードではログインできない。登録の無いメールアドレスと同じ答えを返す（どちらが違うかは言わない）" do
    assert_no_difference -> { Session.count } do
      login("one@example.com", "wrong-password")
    end
    assert_response :unauthorized
    wrong_password = body
    assert cookies["session_id"].blank?

    login("nobody@example.com", "password123")
    assert_response :unauthorized
    assert_equal wrong_password, body
    assert_equal({ "error" => "invalid_credentials" }, body)
  end

  test "ログインしていないときの状態は user: null" do
    get api_v1_session_path
    assert_response :ok
    assert_equal({ "user" => nil }, body)
  end

  test "改ざんした Cookie ではログインした状態にならない" do
    login
    cookies["session_id"] = "#{Session.last.id}--forged"
    get api_v1_session_path
    assert_equal({ "user" => nil }, body)
  end

  test "ログインの Cookie は最後に使ってから30日で切れる（使うたびに30日延びる）" do
    freeze_time do
      login
      assert_match(/expires=#{Regexp.escape(30.days.from_now.httpdate)}/i, response.headers["Set-Cookie"].to_s)
    end
    travel 10.days do
      get api_v1_session_path
      assert_equal "one@example.com", body.dig("user", "email")
      assert_match(/session_id=.*expires=#{Regexp.escape(30.days.from_now.httpdate)}/i, response.headers["Set-Cookie"].to_s, "使うと期限が延びる")
      assert_in_delta Time.current, Session.last.updated_at, 1.second
    end
  end

  test "最後に使ってから30日を過ぎたセッションでは、ログインした状態にならない" do
    login
    Session.last.update_columns(updated_at: 31.days.ago)
    get api_v1_session_path
    assert_equal({ "user" => nil }, body)
    assert cookies["session_id"].blank?, "使えない Cookie は消す"
  end

  test "ログアウトすると、セッションを DB から消し、Cookie も消す。もう一度ログアウトしても失敗しない" do
    login
    assert_difference -> { Session.count }, -1 do
      delete api_v1_session_path, as: :json
    end
    assert_response :no_content
    assert cookies["session_id"].blank?
    get api_v1_session_path
    assert_equal({ "user" => nil }, body)

    delete api_v1_session_path, as: :json
    assert_response :no_content
  end

  test "ログアウトしても、ほかの端末のセッションは残る" do
    other = users(:one).sessions.create!
    login
    delete api_v1_session_path, as: :json
    assert Session.exists?(other.id)
  end

  test "ログイン中の端末で別の人がログインすると、その端末の前のセッションだけを無効にする（ほかの端末は残す）" do
    other_device = users(:one).sessions.create!
    login("one@example.com")
    before = Session.last
    assert_no_difference -> { Session.count } do
      login("two@example.com")
    end
    assert_response :ok
    refute Session.exists?(before.id), "この端末の前のセッションは消える"
    assert Session.exists?(other_device.id), "ほかの端末のセッションは残る"
    assert_equal users(:two), Session.last.user
    get api_v1_session_path
    assert_equal "two@example.com", body.dig("user", "email")
  end

  test "ログインに失敗したときは、前のセッションをそのまま残す" do
    login("one@example.com")
    before = Session.last
    login("two@example.com", "wrong-password")
    assert_response :unauthorized
    assert Session.exists?(before.id)
    get api_v1_session_path
    assert_equal "one@example.com", body.dig("user", "email")
  end

  test "ログアウトしてもゲストの街（Cookie）はそのまま残る" do
    post api_v1_playthrough_path
    guest_token = cookies["guest_token"]
    login
    delete api_v1_session_path, as: :json
    assert_equal guest_token, cookies["guest_token"]
    get api_v1_playthrough_path
    assert_response :ok
  end
end
