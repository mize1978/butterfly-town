require "test_helper"

# #35 本番の経路の診断。Rails に直接つながる中継（REMOTE_ADDR）と、転送ヘッダーの各段が何かを、IP を書かずに残す。
# 回数制限の数え方は client_ip_rate_limit_test.rb で確かめる
class Api::V1::RequestRouteLogTest < ActionDispatch::IntegrationTest
  CLIENT = "203.0.113.7" # 利用者
  EDGE = "172.68.1.9"    # Cloudflare の拠点（公開範囲の中）
  EDGE2 = "104.23.160.112"
  RENDER = "10.0.0.5"    # 社内向けの IP の例

  def wrong_login(path: api_v1_session_path, headers: {}, remote_addr: RENDER)
    post path, params: { email: "one@example.com", password: "wrong-password", password_confirmation: "x" }, as: :json,
               headers: headers, env: { "REMOTE_ADDR" => remote_addr }
  end

  def route_line
    io = StringIO.new
    old, Rails.logger = Rails.logger, ActiveSupport::Logger.new(io)
    yield
    io.string.lines.grep(/\[auth\] request route:/).first.to_s
  ensure
    Rails.logger = old
  end

  test "形A（接続元が社内向け・右端が Cloudflare）を、種類と位置だけで記録し、IP は書かない" do
    line = route_line do
      wrong_login(headers: { "X-Forwarded-For" => "#{CLIENT}, #{EDGE}", "CF-Connecting-IP" => CLIENT, "CF-Ray" => "abc-KIX" })
    end
    assert_includes line, "remote_addr=private forwarded=other,cloudflare"
    assert_includes line, "cf_connecting_ip=forwarded[-2]"
    assert_includes line, "x_real_ip=absent"
    assert_includes line, "cf_ray=present"
    assert_includes line, "remote_ip=forwarded[-1]" # いまの Rails の既定では Cloudflare の拠点で数えている
    [ CLIENT, EDGE, RENDER, "abc-KIX" ].each { |v| refute_includes line, v }
  end

  test "形B（接続元が Cloudflare）も区別して記録する" do
    line = route_line do
      wrong_login(headers: { "X-Forwarded-For" => CLIENT, "CF-Connecting-IP" => CLIENT }, remote_addr: EDGE)
    end
    assert_includes line, "remote_addr=cloudflare forwarded=other"
    assert_includes line, "cf_connecting_ip=forwarded[-1]"
    assert_includes line, "remote_ip=forwarded[-1]"
    [ CLIENT, EDGE ].each { |v| refute_includes line, v }
  end

  test "転送ヘッダーが無い直接の接続や、接続元と一致する値・どこにも無い値も区別する" do
    line = route_line { wrong_login(headers: { "X-Real-IP" => "198.51.100.1", "CF-Connecting-IP" => "198.51.100.9" }, remote_addr: "198.51.100.1") }
    assert_includes line, "remote_addr=other forwarded=none"
    assert_includes line, "x_real_ip=remote_addr"
    assert_includes line, "cf_connecting_ip=unmatched"
    assert_includes line, "remote_ip=remote_addr"
    refute_match(/198\.51\.100/, line)
  end

  test "社内向け以外の中継の種類（100.64/10・ループバック・壊れた値）も分ける" do
    line = route_line { wrong_login(headers: { "X-Forwarded-For" => "#{CLIENT}, not-an-ip, 127.0.0.1" }, remote_addr: "100.64.3.4") }
    assert_includes line, "remote_addr=cgnat forwarded=other,invalid,loopback"
  end

  test "登録でも同じ記録を残す" do
    line = route_line { wrong_login(path: api_v1_registration_path, headers: { "X-Forwarded-For" => "#{CLIENT}, #{EDGE}" }) }
    assert_includes line, "remote_addr=private forwarded=other,cloudflare"
  end
end
