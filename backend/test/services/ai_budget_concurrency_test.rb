require "test_helper"

# #10 同時に予約しても月の上限を超えないことを、別々の DB 接続から実際に同時に予約して確かめる。
# スレッド間でデータを見せるため、テスト用トランザクションを使わない
class AiBudgetConcurrencyTest < ActiveSupport::TestCase
  self.use_transactional_tests = false
  THREADS = 4 # 接続の数（pool 5）からテスト本体の1つを除いた分
  WAIT = 10
  NOW = Time.utc(2099, 1, 15)
  COST = 52_500 # 入力2,000・出力300の最大額

  setup do
    @budget = AiBudget.default
    @month = @budget.month!(NOW)
    # 残りがちょうど2回分になるようにする
    @month.update_columns(spent_micro_yen: @month.limit_micro_yen - 2 * COST)
  end

  teardown do
    AiCall.where(ai_budget_month_id: @month.id).delete_all
    @month.delete
  end

  test "4つの接続から同時に予約しても、通るのは残りの2回分だけで、上限を超えない" do
    ready, start = Queue.new, Queue.new
    threads = Array.new(THREADS) do
      Thread.new do
        Thread.current.report_on_exception = false
        ActiveRecord::Base.connection_pool.with_connection do
          ready << true
          raise "start timed out" unless start.pop(timeout: WAIT)
          @budget.reserve!(purpose: "dev", model: "claude-haiku-5-5", input_tokens: 2000, max_output_tokens: 300, now: NOW)
          :reserved
        rescue AiBudget::Exhausted
          :exhausted
        end
      end
    end
    THREADS.times { flunk "threads not ready" unless ready.pop(timeout: WAIT) }
    THREADS.times { start << true }
    results = threads.map { |t| t.join(WAIT) ? t.value : flunk("thread did not finish") }

    assert_equal({ exhausted: 2, reserved: 2 }, results.tally.sort.to_h)
    @month.reload
    assert_equal 2 * COST, @month.reserved_micro_yen
    assert_equal 0, @month.remaining_micro_yen
    assert_equal 2, AiCall.where(ai_budget_month_id: @month.id).count
  ensure
    threads&.each { |t| t.join(WAIT) || t.kill.join }
  end
end
