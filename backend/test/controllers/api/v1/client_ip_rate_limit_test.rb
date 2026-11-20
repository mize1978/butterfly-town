require "test_helper"
require "minitest/mock"

# #35 回数制限のアクセス元。本番は 利用者 → Cloudflare → Render の振り分け → Rails の順に届く。
# Rails が受け取るのは、REMOTE_ADDR＝Render の振り分け（社内向けの IP）と、X-Forwarded-For＝「…, 利用者, Cloudflare の拠点」。
# Cloudflare の拠点はリクエストごとに変わるので、拠点ではなく、Cloudflare が書き足した利用者の IP ごとに数える
class Api::V1::ClientIpRateLimitTest < ActionDispatch::IntegrationTest
  RENDER = "10.0.0.5" # Render の振り分け（社内向け）
  EDGES = %w[104.23.160.112 141.101.86.38 104.23.160.170 172.68.1.9 162.158.4.4 108.162.200.1 173.245.49.1 188.114.97.1 190.93.241.1 197.234.241.1 198.41.129.1].freeze
  ALICE = "1.21.115.167"
  BOB = "198.51.100.7"

  def wrong_login(client:, edge:, spoof: nil)
    forwarded = [ spoof, client, edge ].compact.join(", ")
    post api_v1_session_path, params: { email: "one@example.com", password: "wrong-password" }, as: :json,
                              headers: { "X-Forwarded-For" => forwarded }, env: { "REMOTE_ADDR" => RENDER }
  end

  # テスト環境の cache_store は null_store で回数を数えないため、この試験の間だけメモリに数える
  def with_counting_store
    memory = ActiveSupport::Cache::MemoryStore.new
    ActionController::Base.cache_store.stub(:increment, ->(*args, **kw) { memory.increment(*args, **kw) }) { yield }
  end

  test "同じ利用者は、Cloudflare の拠点が毎回変わっても回数が積み上がり、11回目で 429 になる" do
    with_counting_store do
      10.times { |i| wrong_login(client: ALICE, edge: EDGES[i]) }
      assert_response :unauthorized
      wrong_login(client: ALICE, edge: EDGES[10])
      assert_response :too_many_requests
    end
  end

  test "別の利用者は、同じ Cloudflare の拠点を通っていても、ほかの利用者の回数に影響されない" do
    with_counting_store do
      10.times { wrong_login(client: ALICE, edge: EDGES[0]) }
      wrong_login(client: ALICE, edge: EDGES[0])
      assert_response :too_many_requests
      wrong_login(client: BOB, edge: EDGES[0])
      assert_response :unauthorized, "Bob は制限されない（パスワードが違うだけ）"
    end
  end

  test "X-Forwarded-For の左端に嘘の IP を入れても、Cloudflare が書き足した利用者の IP で数える" do
    with_counting_store do
      10.times { |i| wrong_login(client: ALICE, edge: EDGES[0], spoof: "203.0.113.#{i}") }
      wrong_login(client: ALICE, edge: EDGES[0], spoof: "203.0.113.99")
      assert_response :too_many_requests
    end
  end

  test "Cloudflare を通らずに直接届いた接続では、X-Forwarded-For を使わず接続元で数える" do
    with_counting_store do
      10.times do |i|
        post api_v1_session_path, params: { email: "one@example.com", password: "wrong-password" }, as: :json,
                                  headers: { "X-Forwarded-For" => "203.0.113.#{i}" }, env: { "REMOTE_ADDR" => "198.51.100.50" }
      end
      post api_v1_session_path, params: { email: "one@example.com", password: "wrong-password" }, as: :json,
                                headers: { "X-Forwarded-For" => "203.0.113.200" }, env: { "REMOTE_ADDR" => "198.51.100.50" }
      assert_response :too_many_requests
    end
  end

  test "経路の確認用のログは、接続元と各段の種類とどちらで数えたかだけを残し、IP そのものは書かない" do
    io = StringIO.new
    old, Rails.logger = Rails.logger, ActiveSupport::Logger.new(io)
    wrong_login(client: ALICE, edge: EDGES[0], spoof: "203.0.113.9")
    line = io.string.lines.grep(/client_ip route/).first
    assert_includes line, 'remote_addr=private forwarded=["other", "other", "cloudflare"] counted_by=forwarded'
    [ ALICE, EDGES[0], "203.0.113.9", RENDER ].each { |ip| refute_includes line, ip }
  ensure
    Rails.logger = old
  end

  test "信頼できる中継は、Rails の既定（社内向けの IP）と、Cloudflare の公開リストの範囲" do
    proxies = Rails.application.config.action_dispatch.trusted_proxies
    assert proxies.any? { _1.include?(IPAddr.new("10.0.0.5")) }, "Render の振り分け（社内向け）"
    EDGES.each { |ip| assert proxies.any? { _1.include?(IPAddr.new(ip)) }, ip }
    refute proxies.any? { _1.include?(IPAddr.new(ALICE)) }, "利用者の IP は信頼しない"
  end
end
