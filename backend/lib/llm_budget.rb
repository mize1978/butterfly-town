# 実LLM検証（Issue #5）の予算台帳。APIを呼ぶ前に「最悪いくらかかるか」を予約し、
# 上限を超えるなら呼ばせない。呼んだあとは実際の使用量で精算する。
#
# - 台帳は1行1件の JSON Lines（追記だけ。書き換えない）
#   reserve：呼ぶ前の予約（最悪の額）／ settle：応答の使用量で精算した額
# - 精算されていない予約は、予約額のまま使ったものとして数える
#   （タイムアウトなどで課金されたか分からない呼び出しを、安全側に倒すため）
# - 外部の gem に依存しない。APIは呼ばない（呼ぶ側がこのクラスを通す）
require "json"
require "securerandom"
require "time"

class LlmBudget
  class OverBudget < StandardError; end

  # Claude Haiku 5.5 の公式単価（USD / 100万トークン、2026-11-11 に
  # platform.claude.com/docs/en/about-claude/pricing で確認。プロンプト10万トークン以下の場合）
  PRICES = {
    "claude-haiku-5-5" => { input: 0.10, output: 0.50, cache_write_5m: 0.125, cache_read: 0.01 }
  }.freeze
  # 10万トークンを超えるプロンプトは単価が上がる（入力 $0.50・出力 $2.50）。この検証では使わないので、呼ばせない
  PROMPT_LIMIT = 100_000

  attr_reader :cap_yen, :fx

  def initialize(ledger_path:, cap_yen:, fx: 150.0, model: "claude-haiku-5-5")
    raise ArgumentError, "単価が分からないモデル：#{model}" unless PRICES.key?(model)
    raise ArgumentError, "上限は0円より大きくする" unless cap_yen.to_f.positive?
    @path, @cap_yen, @fx, @model = ledger_path, cap_yen.to_f, fx.to_f, model
  end

  # 最悪の額（円）：入力トークン数（見積もり）がすべて課金され、出力が max_tokens まで出た場合。
  # Haiku 5.5 は考える分（thinking）も出力トークンとして課金され、max_tokens に含まれる
  def worst_case_yen(input_tokens:, max_tokens:)
    raise OverBudget, "プロンプトが#{PROMPT_LIMIT}トークンを超えると単価が上がるため、この検証では呼ばない" if input_tokens > PROMPT_LIMIT
    p = PRICES.fetch(@model)
    usd(input_tokens * p[:input] + max_tokens * p[:output])
  end

  # 実際の額（円）：応答の usage から計算する
  def actual_yen(usage)
    p = PRICES.fetch(@model)
    u = usage.transform_keys(&:to_sym)
    usd(u.fetch(:input_tokens, 0) * p[:input] +
        u.fetch(:output_tokens, 0) * p[:output] +
        u.fetch(:cache_creation_input_tokens, 0).to_i * p[:cache_write_5m] +
        u.fetch(:cache_read_input_tokens, 0).to_i * p[:cache_read])
  end

  def spent_yen
    entries = read
    settled = entries.select { |e| e["kind"] == "settle" }.to_h { |e| [e["id"], e["yen"]] }
    entries.select { |e| e["kind"] == "reserve" }.sum { |e| settled.fetch(e["id"], e["yen"]) }
  end

  def remaining_yen = @cap_yen - spent_yen

  # 呼ぶ前に必ず通す。足りなければ OverBudget を投げ、台帳には何も書かない
  def reserve!(input_tokens:, max_tokens:, label: nil)
    worst = worst_case_yen(input_tokens:, max_tokens:)
    left = remaining_yen
    raise OverBudget, format("残り%.4f円に対し、最悪%.4f円かかるため呼ばない", left, worst) if worst > left
    id = SecureRandom.uuid
    append("kind" => "reserve", "id" => id, "yen" => worst, "model" => @model, "label" => label,
           "input_tokens_estimate" => input_tokens, "max_tokens" => max_tokens)
    id
  end

  # 応答を受け取ったら精算する。精算しなかった予約は予約額のまま残る
  def settle!(id, usage:, latency_ms: nil)
    raise ArgumentError, "予約が見つからない：#{id}" unless read.any? { |e| e["kind"] == "reserve" && e["id"] == id }
    raise ArgumentError, "精算済み：#{id}" if read.any? { |e| e["kind"] == "settle" && e["id"] == id }
    append("kind" => "settle", "id" => id, "yen" => actual_yen(usage), "usage" => usage, "latency_ms" => latency_ms)
  end

  def summary
    entries = read
    reserves = entries.count { |e| e["kind"] == "reserve" }
    settles = entries.count { |e| e["kind"] == "settle" }
    { model: @model, cap_yen: @cap_yen, fx: @fx, spent_yen: spent_yen, remaining_yen: remaining_yen,
      calls: reserves, unsettled: reserves - settles }
  end

  private

  def usd(per_million) = per_million / 1_000_000.0 * @fx

  def read
    return [] unless File.exist?(@path)
    File.readlines(@path, chomp: true).reject(&:empty?).map { |l| JSON.parse(l) }
  end

  def append(entry)
    File.open(@path, "a") do |f|
      f.flock(File::LOCK_EX)
      f.puts(JSON.generate(entry.merge("at" => Time.now.utc.iso8601)))
    end
  end
end
