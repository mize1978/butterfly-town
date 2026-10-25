require "test_helper"

# 別々のDB接続から同時に同じ行動を送っても、イベント・記憶・進捗が一度だけ反映されることを
# 実際のPostgreSQL上で確認する。スレッド間でデータを見せるため、テスト用トランザクションを使わない。
class ConcurrentProcessingTest < ActiveSupport::TestCase
  self.use_transactional_tests = false
  THREADS = 4

  setup do
    @run = SpikeScenario.load(locations: {"A" => "plaza", "B" => "plaza", "C" => "plaza"})
  end

  # イベントは cause_id で前のイベントを参照するため、新しいものから消す
  teardown do
    @run.memories.delete_all
    @run.confirmed_events.order(id: :desc).each(&:destroy!)
    @run.destroy!
  end

  WAIT_SECONDS = 10

  # 全スレッドが接続を確保してから一斉に実行する。各スレッドは別のSimulationRunインスタンスを使う。
  # 準備に失敗したスレッドも ready に false を返し、待ち合わせには期限を設けて、テストが止まらないようにする。
  def run_concurrently(inputs)
    ready = Queue.new
    start = Queue.new
    threads = inputs.map do |input|
      Thread.new do
        Thread.current.report_on_exception = false
        signaled = false
        ActiveRecord::Base.connection_pool.with_connection do
          run = SimulationRun.find(@run.id)
          ready << true
          signaled = true
          raise "start signal timed out" unless start.pop(timeout: WAIT_SECONDS)
          FixedActionProcessor.new(run).call(input)
        end
      rescue FixedActionProcessor::InvalidAction => e
        e
      ensure
        ready << false unless signaled
      end
    end

    begin
      statuses = Array.new(inputs.size) { ready.pop(timeout: WAIT_SECONDS) }
      flunk "threads failed to get ready: #{statuses.inspect}" unless statuses.all?
      inputs.size.times { start << true }
      threads.map do |t|
        flunk "thread did not finish in time" unless t.join(WAIT_SECONDS)
        t.value
      end
    ensure
      # teardownでの削除と競合しないよう、全スレッドの終了（接続返却）を待つ
      # （例外で終わったスレッドは join が例外を再送出するが、元の失敗は上で報告済みなので握りつぶす）
      threads.each do |t|
        # 期限切れは kill し、ensure（接続返却）が終わるまで join で待つ
        t.join(WAIT_SECONDS) || t.kill.join
      rescue StandardError
        nil
      end
    end
  end

  def setup_command(kind, actor, target: nil, cause_id: nil, id: kind)
    {command_id: id, kind: kind, actor: actor, target: target, task: "setup", fact_key: nil, step: 0, cause_id: cause_id}
  end

  def accepted_invitation
    processor = FixedActionProcessor.new(@run)
    invitation = processor.call(setup_command("invited", "A", target: "B"))
    processor.call(setup_command("accepted", "B", target: "A", cause_id: invitation.id))
  end

  test "the same work command sent concurrently is applied once" do
    acceptance = accepted_invitation
    results = run_concurrently(Array.new(THREADS) { setup_command("worked", "B", cause_id: acceptance.id) })

    assert_equal [ConfirmedEvent], results.map(&:class).uniq
    assert_equal 1, results.map(&:id).uniq.size
    assert_equal 1, @run.confirmed_events.where(kind: "worked").count
    assert_equal 1, @run.reload.progress
  end

  test "work commands with different ids sent concurrently advance preparation once" do
    acceptance = accepted_invitation
    results = run_concurrently(Array.new(THREADS) { |i| setup_command("worked", "B", cause_id: acceptance.id, id: "work-#{i}") })

    assert_equal 1, results.count { |r| r.is_a?(ConfirmedEvent) }
    assert_equal THREADS - 1, results.count { |r| r.is_a?(FixedActionProcessor::InvalidAction) }
    assert_equal 1, @run.confirmed_events.where(kind: "worked").count
    assert_equal 1, @run.reload.progress
  end

  test "the same fact told concurrently creates one memory" do
    inputs = Array.new(THREADS) do |i|
      {command_id: "tell-#{i}", kind: "told", actor: "C", target: "A", task: nil, fact_key: "e2", step: 0, cause_id: nil}
    end
    results = run_concurrently(inputs)

    assert_equal 1, results.count { |r| r.is_a?(ConfirmedEvent) }
    assert_equal 1, @run.confirmed_events.where(kind: "told").count
    assert_equal 1, @run.memories.where(owner: "A", fact_key: "e2").count
  end
end
