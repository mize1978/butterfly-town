require "test_helper"

# #33 特殊介入の決まり：回数（A・B 合わせて3回）・断るとき（回数を消費しない）・再送・行動を直接決めないこと
class InterventionTest < ActiveSupport::TestCase
  setup { @pt = start_playthrough }

  def intervene(**args) = Intervention.new(@pt).call(**args)
  def rumor(id, target: "a", fact_key: "e2") = intervene(kind: "rumor", request_id: id, target:, fact_key:)
  def gathering(id, place: "plaza") = intervene(kind: "gathering", request_id: id, place:)
  def confirm(t) = TimeSlotProcessor.new(@pt).call(time_index: t)

  # 断ったときに変わってはいけないもの
  def snapshot
    @pt.reload
    { used: @pt.interventions_used, version: @pt.state_version, events: @pt.world_events.count,
      memories: Memory.joins(:resident).where(residents: { playthrough_id: @pt.id }).count }
  end

  test "A と B を合わせて3回まで。残り回数が減り、4回目は回数も出来事も記憶も変えずに断る" do
    assert_equal :applied, rumor("1").status
    assert_equal 2, @pt.reload.state[:interventions_left]
    assert_equal :applied, gathering("2").status
    assert_equal :applied, rumor("3", target: "b", fact_key: "e1").status
    assert_equal 0, @pt.reload.state[:interventions_left]

    before = snapshot
    [ rumor("4", target: "c", fact_key: "e1"), gathering("5") ].each do |result|
      assert_equal [ :conflict, "no_interventions_left" ], [ result.status, result.error ]
    end
    assert_equal before, snapshot
  end

  test "相手がもう知っている事実でも1回消費し、出来事は残す。記憶は増えず、答えは知らない場合と同じ" do
    known = rumor("k", target: "a", fact_key: "e1") # A は最初から e1 を知っている
    unknown = rumor("u", target: "a", fact_key: "e2")
    assert_equal [ :applied, :applied ], [ known.status, unknown.status ]
    assert_equal known.to_h.keys, unknown.to_h.keys
    assert_nil known.error
    assert_equal 1, @pt.reload.state[:interventions_left]
    assert_equal %w[rumored rumored], @pt.world_events.order(:id).pluck(:kind)
    a = resident_of(@pt, "a")
    assert_equal [ [ "e1", "initial" ], [ "e2", "rumor" ] ], a.memories.order(:fact_key).pluck(:fact_key, :source)
  end

  test "同じ送信は再送として前の結果を返し、回数も出来事も増やさない。同じ request_id で中身が違えば断る" do
    first = rumor("same")
    before = snapshot
    again = rumor("same")
    assert_equal [ :already_applied, first.event.id ], [ again.status, again.event.id ]
    assert_equal before, snapshot

    changed = rumor("same", target: "b")
    assert_equal [ :conflict, "request_conflict" ], [ changed.status, changed.error ]
    assert_equal [ :conflict, "request_conflict" ], intervene(kind: "gathering", request_id: "same", place: "shop").to_h.values_at(:status, :error)
    assert_equal before, snapshot
  end

  test "時間帯の処理中は、新しい介入を回数を消費せずに断る" do
    time_slot_run(@pt, time_index: 0, status: "running")
    before = snapshot
    assert_equal [ :conflict, "running" ], rumor("r").to_h.values_at(:status, :error)
    assert_equal [ :conflict, "running" ], gathering("g").to_h.values_at(:status, :error)
    assert_equal before, snapshot
  end

  test "集まりが15時間帯の外になる告知（5日目の昼・夜）は、回数を消費せずに断る。5日目の朝なら昼に開く。うわさは最後まで使える" do
    (0..11).each { confirm(_1) }
    assert_equal 12, @pt.reload.time_index
    ok = gathering("morning")
    assert_equal [ :applied, 13 ], [ ok.status, ok.event.payload["at"] ]
    confirm(12)

    before = snapshot
    assert_equal [ :conflict, "too_late" ], gathering("noon").to_h.values_at(:status, :error)
    assert_equal before, snapshot
    assert_equal :applied, rumor("late", target: "b", fact_key: "e1").status
    confirm(13)
    assert_equal [ :conflict, "too_late" ], gathering("night").to_h.values_at(:status, :error)
  end

  test "終わった街・入力の誤りは、回数を消費せずに断る" do
    before = snapshot
    { { kind: "magic", request_id: "x" } => "invalid_kind",
      { kind: "rumor", request_id: "x", target: "nobody", fact_key: "e1" } => "invalid_target",
      { kind: "rumor", request_id: "x", target: "a", fact_key: "e9" } => "invalid_fact",
      { kind: "gathering", request_id: "x", place: "moon" } => "invalid_place",
      { kind: "rumor", request_id: "", target: "a", fact_key: "e1" } => "invalid_request_id" }.each do |args, error|
      assert_equal [ :invalid, error ], intervene(**args).to_h.values_at(:status, :error)
    end
    assert_equal before, snapshot

    (0..14).each { confirm(_1) }
    assert_equal [ :conflict, "finished" ], rumor("end").to_h.values_at(:status, :error)
  end

  test "介入は住民の行動を決めない：直後は場所・移動の予定・出来事（介入以外）・進み具合が変わらず、次の判断の入力だけが変わる" do
    before = @pt.residents.order(:key).pluck(:key, :location_key, :current_plan)
    gathering("g")
    assert_equal before, @pt.residents.order(:key).pluck(:key, :location_key, :current_plan)
    assert_equal [ "gathering_announced" ], @pt.world_events.pluck(:kind)
    assert_equal 0, @pt.reload.festival_progress
    context = ResidentContext.build(resident_of(@pt, "c"), @pt, locations: @pt.residents.to_h { [ _1.key, _1.location_key ] })
    assert_equal [ { "place" => "plaza", "time_index" => 1, "part" => "noon" } ], context["gatherings"]
  end

  test "うわさで得た記憶は、流されたその時間帯に1回だけ、ひとりで判断する機会になる" do
    recorder = Class.new do
      attr_reader :seen

      def initialize = @seen = []
      def call(context, **rails_only) = FixedResponder.default.call(context, **rails_only).tap { @seen << [ context["time_index"], context["resident_key"] ] }
    end.new
    rumor("r", target: "c", fact_key: "e1") # C は e1 を知らない
    TimeSlotProcessor.new(@pt, responder: recorder).call(time_index: 0)
    assert_equal [ [ 0, "c" ] ], recorder.seen
  end
end
