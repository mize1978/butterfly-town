# AI の月予算（#10、README「10-4」・ER図「AIの予算」）。AI を呼ぶ処理は、必ずここを通す。
#
#   1. 予約：呼ぶ前に、その呼び出しで起こり得る最大額（入力トークン数＋出力の上限まで出た場合）を見積もり、
#      月の行をロックして予約する。予約の合計と使った額に足して上限を超えるなら呼ばない（Exhausted）。
#      ロックの中で確かめて足すので、同時に呼んでも上限は超えない
#   2. 精算：応答の使用量（usage）から実額を計算し、予約を外して使った額に足す
#   3. 結果が分からない（タイムアウト・通信エラーなど）：予約額の全額を使ったものとして数える。自動では呼び直さない
#      課金されていないと分かっている失敗（NotBilled）だけ、予約を外して0円にする
#
# 金額は「100万分の1円」の整数。単価・為替・上限・月の区切りのタイムゾーンは config/ai_budget.yml。
# 月の区切りは日本時間（毎月1日 0:00）
class AiBudget
  class Exhausted < StandardError
    attr_reader :resume_at

    def initialize(resume_at)
      @resume_at = resume_at
      super("今月の AI 予算の上限に達したため、新しい呼び出しを止めています")
    end
  end

  class PromptTooLong < StandardError; end
  # 呼んだ側が「課金されていない」と分かっている失敗（API が受け付けなかった など）。予約を外す
  class NotBilled < StandardError; end

  PURPOSES = %w[decision conversation summary dev].freeze
  CONFIG_PATH = Rails.root.join("config/ai_budget.yml")
  MICRO = 1_000_000

  def self.config = @config ||= YAML.safe_load_file(CONFIG_PATH).freeze
  def self.default = @default ||= new(config)

  def initialize(config)
    @config = config
    @fx = Rational(config.fetch("fx_yen_per_usd").to_s)
    @limit_micro_yen = Integer(config.fetch("stop_new_calls_at_yen")) * MICRO
    @zone = ActiveSupport::TimeZone.new(config.fetch("month_time_zone")) or raise ArgumentError, "タイムゾーンが正しくない"
  end

  def month_key(now = Time.current) = now.in_time_zone(@zone).strftime("%Y-%m")
  # 再開できる時期：翌月1日 0:00（月の区切りのタイムゾーン）
  def resume_at(now = Time.current) = now.in_time_zone(@zone).next_month.beginning_of_month

  # 最大額：入力がすべて課金され、出力が上限まで出た場合（考える分も出力として数える）。端数は切り上げ
  def worst_case_micro_yen(model:, input_tokens:, max_output_tokens:)
    limit = config_value("prompt_token_limit")
    raise PromptTooLong, "プロンプトが#{limit}トークンを超えると単価が上がるため呼ばない" if input_tokens > limit
    price = prices(model)
    micro_yen(input_tokens * price[:input] + max_output_tokens * price[:output])
  end

  # 実額：応答の usage から計算する
  def actual_micro_yen(model:, usage:)
    u, price = usage.to_h.transform_keys(&:to_s), prices(model)
    micro_yen(u.fetch("input_tokens", 0).to_i * price[:input] + u.fetch("output_tokens", 0).to_i * price[:output] +
              u.fetch("cache_creation_input_tokens", 0).to_i * price[:cache_write_5m] +
              u.fetch("cache_read_input_tokens", 0).to_i * price[:cache_read])
  end

  # 今月の行（無ければ作る）。同時に作ろうとしても1行になる
  def month!(now = Time.current)
    key = month_key(now)
    AiBudgetMonth.insert_all([ { month: key, limit_micro_yen: @limit_micro_yen } ], unique_by: :month)
    AiBudgetMonth.find_by!(month: key)
  end

  # 呼ぶ前の予約。足りなければ Exhausted を投げ、何も記録しない
  def reserve!(purpose:, model:, input_tokens:, max_output_tokens:, now: Time.current, **owner)
    raise ArgumentError, "purpose が正しくない：#{purpose}" unless PURPOSES.include?(purpose)
    cost = worst_case_micro_yen(model:, input_tokens:, max_output_tokens:)
    month = month!(now)
    AiBudgetMonth.transaction do
      month.lock!
      raise Exhausted, resume_at(now) if month.used_micro_yen + cost > month.limit_micro_yen

      month.update!(reserved_micro_yen: month.reserved_micro_yen + cost)
      AiCall.create!(owner.merge(ai_budget_month: month, purpose: purpose, status: "reserved", request_id: SecureRandom.uuid,
                                 price_version: "#{model}@#{config_value('price_version')}",
                                 input_tokens_counted: input_tokens, max_output_tokens: max_output_tokens,
                                 reserved_cost_micro_yen: cost,
                                 applied: owner[:playthrough] ? "pending" : nil))
    end
  end

  # 応答の使用量で精算する。予約のままの呼び出しだけ（2回目は何もしない）
  def settle!(call, model:, usage:)
    finish!(call) do
      u = usage.to_h.transform_keys(&:to_s)
      { status: "succeeded", actual_cost_micro_yen: actual_micro_yen(model:, usage:),
        input_tokens: u["input_tokens"], output_tokens: u["output_tokens"] }
    end
  end

  # 結果が分からない：予約額の全額を使ったものとして数える
  def unknown!(call) = finish!(call) { { status: "unknown", actual_cost_micro_yen: call.reserved_cost_micro_yen } }

  # 課金されていないと分かっている失敗：予約を外す
  def failed!(call) = finish!(call) { { status: "failed", actual_cost_micro_yen: 0 } }

  # 予約 → 呼び出し → 精算をまとめる。ブロックは [結果, usage] を返す。
  # 例外のときは精算してから投げ直す（NotBilled は failed、それ以外は unknown）。呼び直しはしない
  def with_call(model:, **reserve_args)
    call = reserve!(model:, **reserve_args)
    begin
      result, usage = yield(call)
    rescue NotBilled
      failed!(call)
      raise
    rescue StandardError
      unknown!(call)
      raise
    end
    settle!(call, model:, usage:)
    result
  end

  private

  def config_value(key) = @config.fetch(key)

  def prices(model)
    p = @config.fetch("models").fetch(model) { raise ArgumentError, "単価が分からないモデル：#{model}" }
    p.to_h { |k, v| [ k.to_sym, Rational(v.to_s) ] }
  end

  # USD / 100万トークン × トークン数 × 為替 ＝ 100万分の1円
  def micro_yen(usd_per_million_times_tokens) = (usd_per_million_times_tokens * @fx).ceil

  def finish!(call)
    AiBudgetMonth.transaction do
      month = AiBudgetMonth.lock.find(call.ai_budget_month_id)
      call.lock!
      next call unless call.status == "reserved"

      attrs = yield
      month.update!(reserved_micro_yen: month.reserved_micro_yen - call.reserved_cost_micro_yen,
                    spent_micro_yen: month.spent_micro_yen + attrs.fetch(:actual_cost_micro_yen))
      call.update!(attrs)
      call
    end
  end
end
