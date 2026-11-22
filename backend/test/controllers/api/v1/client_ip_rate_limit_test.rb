require "test_helper"
require "minitest/mock"

# #35 回数制限のアクセス元。本番の経路は、#57 の診断ログ（2026-11-22、登録とログインの2件）で確認した次の形：
#   REMOTE_ADDR＝ループバック、X-Forwarded-For＝「…, 利用者, Cloudflare の拠点, 社内向けの中継」、CF-Connecting-IP＝右から3番目と同じ
# この形のときだけ右から3番目（Cloudflare が書き足した利用者）で数え、それ以外の経路は直接の接続元（REMOTE_ADDR）で数える
class Api::V1::ClientIpRateLimitTest < ActionDispatch::IntegrationTest
  LOOPBACK = "127.0.0.1"
  RENDER = "10.0.0.5" # Render の中継（社内向け）
  EDGES = %w[104.23.160.112 141.101.86.38 104.23.160.170 172.68.1.9 162.158.4.4 108.162.200.1 173.245.49.1 188.114.97.1 190.93.241.1 197.234.241.1 198.41.129.1].freeze
  ALICE = "1.21.115.167"
  BOB = "198.51.100.7"

  def login(forwarded:, remote_addr: LOOPBACK, cf_connecting_ip: :auto, headers: {})
    cf = cf_connecting_ip == :auto ? forwarded.split(",").map(&:strip)[-3] : cf_connecting_ip
    headers = headers.merge("X-Forwarded-For" => forwarded)
    headers["CF-Connecting-IP"] = cf if cf
    post api_v1_session_path, params: { email: "one@example.com", password: "wrong-password" }, as: :json,
                              headers: headers, env: { "REMOTE_ADDR" => remote_addr }
  end

  def via_render(client, edge, spoof: nil) = [ spoof, client, edge, RENDER ].compact.join(", ")

  # テスト環境の cache_store は null_store で回数を数えないため、この試験の間だけメモリに数える
  def with_counting_store
    memory = ActiveSupport::Cache::MemoryStore.new
    ActionController::Base.cache_store.stub(:increment, ->(*args, **kw) { memory.increment(*args, **kw) }) { yield }
  end

  def assert_counted_together(&request)
    with_counting_store do
      10.times { |i| request.call(i) }
      assert_response :unauthorized
      request.call(10)
      assert_response :too_many_requests
    end
  end

  test "本番の経路では、同じ利用者は Cloudflare の拠点が毎回変わっても回数が積み上がり、11回目で 429 になる" do
    assert_counted_together { |i| login(forwarded: via_render(ALICE, EDGES[i])) }
  end

  test "本番の経路では、別の利用者は同じ拠点を通っていても影響されない" do
    with_counting_store do
      11.times { login(forwarded: via_render(ALICE, EDGES[0])) }
      assert_response :too_many_requests
      login(forwarded: via_render(BOB, EDGES[0]))
      assert_response :unauthorized, "Bob は制限されない（パスワードが違うだけ）"
    end
  end

  test "X-Forwarded-For の左端に嘘の IP を足しても、利用者の IP で数える" do
    assert_counted_together { |i| login(forwarded: via_render(ALICE, EDGES[0], spoof: "203.0.113.#{i}")) }
  end

  test "Forwarded ヘッダーで嘘の IP を送っても、数え方は変わらない" do
    assert_counted_together { |i| login(forwarded: via_render(ALICE, EDGES[0]), headers: { "Forwarded" => "for=192.0.2.#{i}" }) }
  end

  test "出口が Cloudflare の範囲にある利用者（Workers など）が嘘の IP を足しても、出口の IP で数える" do
    worker = "172.68.200.1"
    assert_counted_together { |i| login(forwarded: via_render(worker, EDGES[i % 3], spoof: "6.6.6.#{i}")) }
  end

  test "直接の接続元がループバック以外なら、X-Forwarded-For を使わず接続元で数える" do
    assert_counted_together { |i| login(forwarded: via_render("203.0.113.#{i}", EDGES[0]), remote_addr: "192.168.1.20") }
    assert_counted_together { |i| login(forwarded: "203.0.113.#{i}, #{EDGES[0]}", remote_addr: "172.68.1.9", cf_connecting_ip: "203.0.113.#{i}") }
  end

  test "確認した形と違う X-Forwarded-For（段が足りない・並びが違う・CF-Connecting-IP が合わない）は、接続元で数える" do
    assert_counted_together { |i| login(forwarded: "203.0.113.#{i}, #{RENDER}", cf_connecting_ip: nil) }
    assert_counted_together { |i| login(forwarded: "203.0.113.#{i}, #{RENDER}, #{EDGES[0]}") }
    assert_counted_together { |i| login(forwarded: via_render("203.0.113.#{i}", EDGES[0]), cf_connecting_ip: nil) }
    assert_counted_together { |i| login(forwarded: via_render("203.0.113.#{i}", EDGES[0]), cf_connecting_ip: "198.51.100.99") }
  end

  test "登録も同じ判定で数える" do
    with_counting_store do
      11.times do |i|
        post api_v1_registration_path, params: { email: "", password: "x" }, as: :json,
                                       headers: { "X-Forwarded-For" => via_render(ALICE, EDGES[i]), "CF-Connecting-IP" => ALICE }, env: { "REMOTE_ADDR" => LOOPBACK }
      end
      assert_response :too_many_requests
    end
  end

  test "経路のログに、どちらで数えたかが出て、IP は出ない" do
    io = StringIO.new
    old, Rails.logger = Rails.logger, ActiveSupport::Logger.new(io)
    login(forwarded: via_render(ALICE, EDGES[0], spoof: "203.0.113.9"))
    line = io.string.lines.grep(/request route/).first.to_s
    assert_includes line, "counted_by=render_route"
    [ ALICE, EDGES[0], "203.0.113.9", RENDER ].each { |ip| refute_includes line, ip }
  ensure
    Rails.logger = old
  end

  test "Rails 全体の信頼できる中継は既定のまま（Cloudflare の範囲を足さない）" do
    assert_equal ActionDispatch::RemoteIp::TRUSTED_PROXIES, Rails.application.config.action_dispatch.trusted_proxies.presence || ActionDispatch::RemoteIp::TRUSTED_PROXIES
  end
end
