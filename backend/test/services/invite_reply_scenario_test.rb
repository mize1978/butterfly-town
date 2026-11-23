require "test_helper"

# #55 誘いへの返事（受ける・断る）と、承諾からの作業。
# Issue の「確認用の筋書き（決まった応答）」を15時間帯通して確かめる。各時間帯は2回送り、2回目で何も増えないことも見る
class InviteReplyScenarioTest < ActiveSupport::TestCase
  # 決まった応答のまま、判断した住民を時間帯ごとに記録する
  class Recorder
    attr_reader :deciders

    def initialize = @deciders = Hash.new { |h, k| h[k] = [] }

    def call(context, **rails_only)
      @deciders[context.fetch("time_index")] << context.fetch("resident_key")
      FixedResponder.default.call(context, **rails_only)
    end
  end

  setup do
    @pt = start_playthrough
  end

  def counts
    @pt.reload
    { events: @pt.world_events.count, memories: Memory.joins(:resident).where(residents: { playthrough_id: @pt.id }).count,
      progress: @pt.festival_progress, plans: @pt.residents.order(:key).pluck(:current_plan), relationships: @pt.relationships.count }
  end

  def location(key) = resident_of(@pt, key).location_key

  def summarize(events) = events.map { [ _1.kind, _1.actor_key, _1.target_key ].compact.join(":") }

  # Issue の表：時間帯ごとに成り立つ出来事（kind:actor:target）
  EXPECTED_EVENTS = {
    0 => [], 1 => %w[consulted:a:c told:c:a], 2 => %w[moved:a], 3 => [], 4 => %w[invited:a:b], 5 => %w[accepted:b:a],
    6 => %w[worked:b], 7 => %w[worked:b], 8 => [], 9 => %w[worked:b], 10 => %w[worked:b], 11 => [],
    12 => %w[worked:b], 13 => %w[worked:b], 14 => []
  }.freeze

  # 判断した住民（同じ場所に相手がいる、またはひとりでも判断する条件1〜3）
  EXPECTED_DECIDERS = {
    0 => [], 1 => %w[a c], 2 => %w[a], 3 => %w[a c], 4 => %w[a b], 5 => %w[b],
    6 => %w[b], 7 => %w[a b c], 8 => [], 9 => %w[b], 10 => %w[a b c], 11 => [],
    12 => %w[b], 13 => %w[a b c], 14 => []
  }.freeze

  # A の居場所：夜に店へ向かうと決め、翌日の朝・昼は店、夜は家へ戻る
  EXPECTED_A_LOCATION = { 2 => "home_a", 3 => "shop", 4 => "shop", 5 => "home_a", 6 => "plaza" }.freeze

  test "決まった応答で、確認用の筋書きが15時間帯で成り立つ（承諾後の朝・昼に作業6回・進み具合6）。各時間帯の再送では何も増えない" do
    recorder = Recorder.new
    actual_events, actual_rejected = {}, {}

    Playthrough::TIME_SLOTS.times do |t|
      result = TimeSlotProcessor.new(@pt, responder: recorder).call(time_index: t)
      assert_equal :confirmed, result.status, "時間帯#{t}"
      actual_events[t] = summarize(result.events)
      actual_rejected[t] = result.rejected.map { "#{_1[:actor_key]}:#{_1[:action_type]}" }
      assert_equal EXPECTED_A_LOCATION[t], location("a"), "時間帯#{t}の A の場所" if EXPECTED_A_LOCATION.key?(t)

      before = counts
      again = TimeSlotProcessor.new(@pt, responder: recorder).call(time_index: t)
      assert_equal :already_confirmed, again.status, "時間帯#{t}の再送"
      assert_equal before, counts, "時間帯#{t}の再送で増えたものがある"
    end

    assert_equal EXPECTED_EVENTS, actual_events
    assert_equal EXPECTED_DECIDERS, (0..14).to_h { [ _1, recorder.deciders[_1].sort ] }
    # C は A と会うたびに e2 を伝え直そうとして、成り立たない（#9 からの仕様のまま）
    assert_equal({ 3 => %w[c:tell], 7 => %w[c:tell], 10 => %w[c:tell], 13 => %w[c:tell] }, actual_rejected.reject { _2.empty? })

    @pt.reload
    assert_equal [ 6, 7, 9, 10, 12, 13 ], @pt.world_events.where(kind: "worked").order(:time_index).pluck(:time_index)
    assert_equal 6, @pt.festival_progress
    assert_equal "finished", @pt.status
    invite = @pt.world_events.find_by!(kind: "invited")
    assert_equal invite.id, @pt.world_events.find_by!(kind: "accepted").cause_id
    assert_equal 1, @pt.world_events.where(kind: "invited").count, "A は受けられた後に誘い直さない"
  end
end
