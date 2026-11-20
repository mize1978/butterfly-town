require "test_helper"
require "minitest/mock"

# #16 他サイトからの登録・ログイン・ログアウトを拒否する（login CSRF の対策）。
# 正規の画面（同じオリジンの fetch）は、JSON で送り、ブラウザは Sec-Fetch-Site: same-origin を付ける
class Api::V1::AuthForgeryTest < ActionDispatch::IntegrationTest
  SAME_ORIGIN = { "Sec-Fetch-Site" => "same-origin", "Origin" => "http://www.example.com" }.freeze
  CREDENTIALS = { email: "one@example.com", password: "password123" }.freeze
  SIGN_UP = { email: "new@example.com", password: "password123", password_confirmation: "password123" }.freeze

  def body = response.parsed_body

  def assert_rejected
    assert_response :forbidden
    assert_equal({ "error" => "cross_site_request" }, body)
    assert cookies["session_id"].blank?, "Cookie を入れない"
  end

  test "正規の画面からは、登録・ログイン・ログアウトできる" do
    post api_v1_registration_path, params: SIGN_UP, headers: SAME_ORIGIN, as: :json
    assert_response :created
    delete api_v1_session_path, headers: SAME_ORIGIN, as: :json
    assert_response :no_content
    post api_v1_session_path, params: CREDENTIALS, headers: SAME_ORIGIN, as: :json
    assert_response :ok
    assert_equal "one@example.com", body.dig("user", "email")
  end

  test "他サイトのフォーム（JSON でない送信）からのログイン・登録は拒否する" do
    assert_no_difference -> { Session.count + User.count } do
      post api_v1_session_path, params: CREDENTIALS, headers: { "Origin" => "https://evil.example", "Sec-Fetch-Site" => "cross-site" }
      assert_rejected
      post api_v1_registration_path, params: SIGN_UP
      assert_rejected
    end
  end

  test "JSON でも、ブラウザが他サイトからの要求と示したら拒否する（cross-site・same-site）" do
    %w[cross-site same-site].each do |site|
      assert_no_difference -> { Session.count + User.count } do
        post api_v1_session_path, params: CREDENTIALS, headers: { "Sec-Fetch-Site" => site }, as: :json
        assert_rejected
        post api_v1_registration_path, params: SIGN_UP, headers: { "Sec-Fetch-Site" => site }, as: :json
        assert_rejected
      end
    end
  end

  test "Sec-Fetch-Site を付けない古いブラウザでも、別のサイトの Origin なら拒否する" do
    assert_no_difference -> { Session.count } do
      post api_v1_session_path, params: CREDENTIALS, headers: { "Origin" => "https://evil.example" }, as: :json
      assert_rejected
    end
  end

  test "Sec-Fetch-Site を付けない接続（LAN の http など安全でない接続）でも、Origin が同じなら登録・ログインできる" do
    post api_v1_registration_path, params: SIGN_UP, headers: { "Origin" => "http://www.example.com" }, as: :json
    assert_response :created
    post api_v1_session_path, params: CREDENTIALS, headers: { "Origin" => "http://www.example.com" }, as: :json
    assert_response :ok
  end

  test "他サイトからのログアウトは拒否し、ログインしたままにする" do
    post api_v1_session_path, params: CREDENTIALS, headers: SAME_ORIGIN, as: :json
    assert_no_difference -> { Session.count } do
      delete api_v1_session_path, headers: { "Sec-Fetch-Site" => "cross-site" }
      assert_response :forbidden
    end
    get api_v1_session_path
    assert_equal "one@example.com", body.dig("user", "email")
  end

  # テスト環境の cache_store は null_store で回数を数えないため、この試験の間だけメモリに数える
  def with_counting_store
    memory = ActiveSupport::Cache::MemoryStore.new
    store = ActionController::Base.cache_store
    store.stub(:increment, ->(*args, **kw) { memory.increment(*args, **kw) }) { yield }
  end

  test "ログインは3分に10回まで。11回目は 429 で、誤ったパスワードの試行も数える" do
    with_counting_store do
      10.times do
        post api_v1_session_path, params: CREDENTIALS.merge(password: "wrong-password"), as: :json
        assert_response :unauthorized
      end
      post api_v1_session_path, params: CREDENTIALS, as: :json
      assert_response :too_many_requests
      assert_equal({ "error" => "rate_limited" }, body)
      assert cookies["session_id"].blank?
    end
  end

  test "登録も3分に10回まで" do
    with_counting_store do
      10.times { |i| post api_v1_registration_path, params: SIGN_UP.merge(email: "u#{i}@example.com"), as: :json }
      assert_response :created
      assert_no_difference -> { User.count } do
        post api_v1_registration_path, params: SIGN_UP.merge(email: "u10@example.com"), as: :json
      end
      assert_response :too_many_requests
    end
  end
end
