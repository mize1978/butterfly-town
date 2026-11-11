# Issue #5：住民A・祭りの準備の場面で、記憶だけを変えた2条件を実LLMで試す。
#
#   cd backend
#   # APIキーなし：入力の中身と予算だけを見る（APIは呼ばない）
#   BUNDLE_GEMFILE=script/llm/Gemfile bundle exec ruby script/llm_trial.rb --dry-run
#   # 実際に呼ぶ（ANTHROPIC_API_KEY が必要。各条件 --runs 回）
#   BUNDLE_GEMFILE=script/llm/Gemfile bundle exec ruby script/llm_trial.rb --runs 1
#   BUNDLE_GEMFILE=script/llm/Gemfile bundle exec ruby script/llm_trial.rb --runs 10 --tag compare-v1
#
# --tag で試行のまとまりに名前を付ける（省略時 smoke＝動作確認）。比較の集計は同じ tag の行だけで行う。
# tag の無い古い行（2026-11-11 の 401 の4件と、--runs 1 を2回実行した動作確認の4件）は動作確認として扱う
#
# 条件（fixtures/spike/three_residents.json から、Aの記憶だけを変える）
#   absence_only        ：Aは「Bが昨年の準備に来なかった」ことだけを知っている
#   absence_and_reason  ：それに加えて、Cから「急な家族の用事だった」と聞いている
# 結果は docs/spike/llm-trials.jsonl に1回1行で追記する。費用は docs/spike/llm-ledger.jsonl
require "json"
require "anthropic"
require_relative "../lib/llm_responder"

ROOT = File.expand_path("../..", __dir__)
data = JSON.parse(File.read(File.join(ROOT, "fixtures/spike/three_residents.json")))
facts = data.fetch("events").to_h { [_1.fetch("id"), _1.fetch("fact")] }
a = data.fetch("residents").find { _1.fetch("id") == "A" }
m1 = data.fetch("memories").find { _1.fetch("id") == "m1" }
memory = ->(fact_key, source, interpretation) {
  { "fact_key" => fact_key, "content" => facts.fetch(fact_key), "interpretation" => interpretation, "source" => source }
}
base = {
  "resident_id" => "A", "scene" => "festival_prep", "step" => 0, "location" => "plaza",
  "personality" => a.fetch("personality"), "goals" => a.fetch("goals"),
  "present" => %w[A B C], "locations" => data.fetch("locations")
}
CONDITIONS = {
  "absence_only" => base.merge("memories" => [memory.(m1.fetch("source_event_id"), m1.fetch("source"), m1.fetch("interpretation"))]),
  "absence_and_reason" => base.merge("memories" => [
    memory.(m1.fetch("source_event_id"), m1.fetch("source"), m1.fetch("interpretation")),
    memory.("e2", "Cから聞いた", nil) # 伝聞。受け手の解釈はまだ無い
  ])
}.freeze

runs = (i = ARGV.index("--runs")) ? Integer(ARGV[i + 1]) : 1
tag = (i = ARGV.index("--tag")) ? ARGV.fetch(i + 1) : "smoke"
abort "--tag は英数字と - _ だけ" unless tag.match?(/\A[\w-]+\z/)
only = (i = ARGV.index("--condition")) ? [ARGV[i + 1]] : CONDITIONS.keys
abort "知らない条件：#{only - CONDITIONS.keys}" unless (only - CONDITIONS.keys).empty?

budget = LlmBudget.new(
  ledger_path: ENV.fetch("LLM_LEDGER", File.join(ROOT, "docs/spike/llm-ledger.jsonl")),
  cap_yen: Float(ENV.fetch("LLM_BUDGET_YEN", "500")), # 2026-11-11 みぜが500円に決定
  fx: Float(ENV.fetch("LLM_FX_YEN", "150"))
)

if ARGV.include?("--dry-run")
  responder = LlmResponder.new(client: nil, budget:)
  only.each do |name|
    req = responder.request(CONDITIONS.fetch(name))
    puts "=== #{name} ===", "[system]", req[:system_], "[user]", req[:messages].first[:content], ""
  end
  worst = budget.worst_case_yen(input_tokens: 2_000, max_tokens: 2048)
  puts format("予算：上限%.0f円・残り%.4f円。1回の最悪の額は入力2,000トークンと仮定して約%.4f円（実際は呼ぶ前に数える）",
              budget.cap_yen, budget.remaining_yen, worst)
  puts format("今回の予定：%d条件×%d回＝%d回、最悪でも約%.2f円", only.size, runs, only.size * runs, worst * only.size * runs)
  exit
end

key = ENV["ANTHROPIC_API_KEY"].to_s.strip # 貼り付けで混じる前後の空白・改行を落とす
abort "ANTHROPIC_API_KEY が設定されていません（--dry-run なら不要）" if key.empty?
# api_key を明示して渡す：SDKが ANTHROPIC_AUTH_TOKEN やプロファイルを自動で拾わないようにする
# 自動再試行しない：二重課金を台帳の外で起こさない
client = Anthropic::Client.new(api_key: key, max_retries: 0, timeout: 60)
responder = LlmResponder.new(client:, budget:)
log = File.join(ROOT, "docs/spike/llm-trials.jsonl")
results = Hash.new { |h, k| h[k] = [] }

only.each do |name|
  runs.times do |n|
    r = responder.call(CONDITIONS.fetch(name))
    results[name] << r
    File.open(log, "a") do |f|
      f.puts JSON.generate("at" => Time.now.utc.iso8601, "tag" => tag, "condition" => name, "run" => n + 1,
                           "model" => LlmResponder::MODEL, "prompt_version" => LlmResponder::PROMPT_VERSION,
                           "status" => r.status, "proposal" => r.proposal, "errors" => r.errors, "usage" => r.usage,
                           "latency_ms" => r.latency_ms, "stop_reason" => r.stop_reason)
    end
    line = r.ok? ? "#{r.proposal["action_type"]} → #{r.proposal["target"] || "-"}：#{r.proposal["reason"]}" : "#{r.status}：#{r.errors&.join("／")}"
    puts "#{name} ##{n + 1} #{line}"
    if r.status == "over_budget"
      puts "予算の上限に達したので止めます"
      break
    end
  end
end

puts "", "=== まとめ（tag: #{tag}・今回の実行分のみ）==="
results.each do |name, rs|
  ok = rs.select(&:ok?)
  dist = ok.map { "#{_1.proposal["action_type"]}→#{_1.proposal["target"] || "-"}" }.tally.sort_by { -_2 }
  lat = rs.filter_map(&:latency_ms).sort
  pct = ->(q) { lat.empty? ? "-" : lat[((lat.size - 1) * q).round] }
  puts "#{name}：#{rs.size}回（成立 #{ok.size}・不成立 #{rs.size - ok.size}）#{dist.map { "#{_1} #{_2}回" }.join("、")}"
  puts "  応答時間 p50 #{pct.(0.5)}ms・p95 #{pct.(0.95)}ms"
end
s = budget.summary
puts format("予算：使った額 %.4f円／残り %.4f円（呼び出し %d回・未精算 %d回）", s[:spent_yen], s[:remaining_yen], s[:calls], s[:unsettled])
