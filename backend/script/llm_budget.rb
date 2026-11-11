# 実LLM検証（Issue #5）の残予算を確かめる。APIは呼ばない。
#
#   ruby script/llm_budget.rb status
#     → 上限・使った額・残り・呼び出し回数・未精算の数
#   ruby script/llm_budget.rb check --input-tokens 2000 --max-tokens 1024
#     → その1回の最悪の額と、呼んでよいか（だめなら終了コード1）
#
# 上限は LLM_BUDGET_YEN（省略時500円。2026-11-11 みぜ決定）、為替は LLM_FX_YEN（省略時150円）、
# 台帳は LLM_LEDGER（省略時 docs/spike/llm-ledger.jsonl）で指定する
require_relative "../lib/llm_budget"

cap = ENV.fetch("LLM_BUDGET_YEN", "500")
budget = LlmBudget.new(
  ledger_path: ENV.fetch("LLM_LEDGER", File.expand_path("../../docs/spike/llm-ledger.jsonl", __dir__)),
  cap_yen: Float(cap), fx: Float(ENV.fetch("LLM_FX_YEN", "150"))
)

def arg(name) = (i = ARGV.index(name)) && Integer(ARGV[i + 1])

case ARGV.first
when "status"
  s = budget.summary
  puts format("モデル %s／上限 %.0f円（1ドル%.0f円で換算）", s[:model], s[:cap_yen], s[:fx])
  puts format("使った額 %.4f円／残り %.4f円／呼び出し %d回（未精算 %d回は予約額で計上）",
              s[:spent_yen], s[:remaining_yen], s[:calls], s[:unsettled])
when "check"
  input, max = arg("--input-tokens"), arg("--max-tokens")
  abort "--input-tokens と --max-tokens を指定してください" unless input && max
  begin
    worst = budget.worst_case_yen(input_tokens: input, max_tokens: max)
    left = budget.remaining_yen
    puts format("この1回の最悪の額 %.4f円／残り %.4f円", worst, left)
    if worst > left
      puts "→ 呼ばない（上限を超える）"
      exit 1
    end
    puts format("→ 呼んでよい（あと最大 %d回分）", (left / worst).floor)
  rescue LlmBudget::OverBudget => e
    puts "→ 呼ばない（#{e.message}）"
    exit 1
  end
else
  abort "使い方：ruby script/llm_budget.rb status | check --input-tokens N --max-tokens M"
end
