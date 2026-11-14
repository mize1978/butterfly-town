# 開発検証用：今月の AI 予算の状態を見る（API は呼ばない）。bin/rails ai_budget:status
namespace :ai_budget do
  desc "今月の AI 予算（上限・予約・使った額・残り・呼び出し数）を表示する"
  task status: :environment do
    budget = AiBudget.default
    month = budget.month!
    yen = ->(micro) { format("%.4f円", micro / 1_000_000.0) }
    calls = month.ai_calls.group(:status).count
    puts "#{month.month}（UTC）：止める額 #{yen[month.limit_micro_yen]}／予約中 #{yen[month.reserved_micro_yen]}／" \
         "使った額 #{yen[month.spent_micro_yen]}／残り #{yen[month.remaining_micro_yen]}"
    puts "呼び出し #{calls.values.sum}回 #{calls.inspect}（unknown は予約額の全額で計上）"
    puts "再開できる時期（予算が尽きた場合）：#{budget.resume_at.in_time_zone('Asia/Tokyo').strftime('%Y-%m-%d %H:%M')}（日本時間）"
  end
end
