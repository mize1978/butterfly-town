require "test_helper"

# #16 登録。メールアドレスとパスワードで登録すると、そのままログインした状態になる
class Api::V1::RegistrationsControllerTest < ActionDispatch::IntegrationTest
  def register(**attrs)
    post api_v1_registration_path, params: { email: "new@example.com", password: "password123", password_confirmation: "password123" }.merge(attrs), as: :json
  end

  def body = response.parsed_body

  test "正しい入力なら登録でき、ログインした状態になる（セッションの Cookie が入る）" do
    assert_difference -> { User.count } => 1, -> { Session.count } => 1 do
      register(email: " New@Example.com ")
    end
    assert_response :created
    assert_equal({ "user" => { "email" => "new@example.com" } }, body)
    assert cookies["session_id"].present?
    refute_includes response.body, "password", "パスワードやハッシュは返さない"

    get api_v1_session_path
    assert_equal "new@example.com", body.dig("user", "email")
  end

  test "同じメールアドレスでは登録できない（大文字・小文字の違いも同じとみなす）" do
    assert_no_difference -> { User.count + Session.count } do
      register(email: "ONE@example.com")
    end
    assert_response :unprocessable_entity
    assert_equal({ "email" => [ "taken" ] }, body["errors"])
    assert cookies["session_id"].blank?
  end

  test "形式の違うメールアドレス・短いパスワード・確認用の不一致は、理由ごとに返す" do
    assert_no_difference -> { User.count } do
      register(email: "not-an-email", password: "short", password_confirmation: "other")
    end
    assert_response :unprocessable_entity
    assert_equal [ "invalid" ], body.dig("errors", "email")
    assert_includes body.dig("errors", "password"), "too_short"
    assert_equal [ "confirmation" ], body.dig("errors", "password_confirmation")
  end

  test "メールアドレスやパスワードを文字列でなく送ると、500 にせず入力の誤り（422）として返す" do
    assert_no_difference -> { User.count } do
      post api_v1_registration_path, params: { email: "n1@example.com", password: 12_345_678, password_confirmation: 12_345_678 }, as: :json
      assert_response :unprocessable_entity
      assert_includes body.dig("errors", "password"), "blank"
      post api_v1_registration_path, params: { email: 123, password: "password123", password_confirmation: "password123" }, as: :json
      assert_response :unprocessable_entity
      assert body.dig("errors", "email").present?
      post api_v1_registration_path, params: { email: { "x" => 1 }, password: [ "a" ] }, as: :json
      assert_response :unprocessable_entity
      # 確認用だけを文字列でなく送っても、確かめを飛ばさない（入っていないものとして扱うと、確認なしで登録できてしまう）
      post api_v1_registration_path, params: { email: "n2@example.com", password: "password123", password_confirmation: 12_345 }, as: :json
      assert_response :unprocessable_entity
      assert_equal [ "confirmation" ], body.dig("errors", "password_confirmation")
    end
  end

  test "何も入れずに送ると、必須の理由を返す" do
    post api_v1_registration_path, params: {}, as: :json
    assert_response :unprocessable_entity
    assert_includes body.dig("errors", "email"), "blank"
    assert_includes body.dig("errors", "password"), "blank"
  end

  test "ログイン中の端末で登録すると、その端末の前のセッションだけを無効にする" do
    post api_v1_session_path, params: { email: "one@example.com", password: "password123" }, as: :json
    before = Session.last
    register
    assert_response :created
    refute Session.exists?(before.id)
    assert_equal "new@example.com", Session.last.user.email
  end

  test "登録してもゲストの街（Cookie）はそのまま残る" do
    post api_v1_playthrough_path
    guest_token = cookies["guest_token"]
    register
    assert_equal guest_token, cookies["guest_token"]
    get api_v1_playthrough_path
    assert_response :ok
  end
end
