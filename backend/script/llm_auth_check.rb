# 401 の切り分け用。キーやヘッダーの値は表示しない（長さ・形・状態コードだけ）。
# 呼ぶのは無料の GET /v1/models だけ（トークンを使わない）。
#   BUNDLE_GEMFILE=script/llm/Gemfile bundle exec ruby script/llm_auth_check.rb
require "net/http"
require "json"
require "anthropic"

key = ENV["ANTHROPIC_API_KEY"].to_s
puts "ANTHROPIC_API_KEY：#{key.empty? ? "未設定" : "設定あり（#{key.size}文字）"}"
puts "  前後に空白や改行：#{key != key.strip ? "あり" : "なし"}"
puts "  形：#{key.strip.start_with?("sk-ant-api") ? "APIキーの形（sk-ant-api…）" : key.strip.start_with?("sk-ant-") ? "sk-ant- だがAPIキーではない形" : "sk-ant- で始まらない"}"
%w[ANTHROPIC_AUTH_TOKEN ANTHROPIC_BASE_URL ANTHROPIC_PROFILE ANTHROPIC_CONFIG_DIR].each do |v|
  puts "#{v}：#{ENV[v].to_s.empty? ? "未設定" : "設定あり"}"
end
base = URI(ENV["ANTHROPIC_BASE_URL"].to_s.empty? ? "https://api.anthropic.com" : ENV["ANTHROPIC_BASE_URL"])
puts "送り先のホスト：#{base.host}"

abort "キーが未設定なので、ここで止めます" if key.strip.empty?
client = Anthropic::Client.new(max_retries: 0, timeout: 30)
kind = client.api_key ? "api_key（環境変数）" : client.auth_token ? "auth_token" : "プロファイル等の自動検出"
puts "SDKが使う認証：#{kind}"

# 結果は状態コードと例外の種類だけ。メッセージや一覧の中身は出さない
def status_of
  yield
  "200（通った）"
rescue Anthropic::Errors::APIStatusError => e
  "#{e.status}（#{e.class.name.split("::").last}）"
rescue StandardError => e
  "失敗（#{e.class.name}）" # 接続できない等。Aで落ちてもBまで進める
end

# A：SDK 2.3.0 のまま（API版 2026-10-21、Authorization: Bearer）
# models.list は呼んだ時点で GET /v1/models を送る。返ってきた一覧（Page）は使わない
puts "A. SDKのまま（Bearer）：#{status_of { client.models.list; nil }}"

# B：同じキーを x-api-key で、旧API版で送る（キーそのものが有効かを見る）
uri = URI.join(base.to_s.end_with?("/") ? base.to_s : "#{base}/", "v1/models")
req = Net::HTTP::Get.new(uri)
req["x-api-key"] = key.strip
req["anthropic-version"] = "2023-06-01"
b = begin
  Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == "https", read_timeout: 30) { _1.request(req) }.code
rescue StandardError => e
  "失敗（#{e.class.name}）"
end
puts "B. x-api-key（旧API版）：#{b}"
