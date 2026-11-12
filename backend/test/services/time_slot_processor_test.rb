require "test_helper"

# #8 時間帯の進行（決まった応答で）。1時間帯ずつ確定し、成立した行動だけを出来事にする
class TimeSlotProcessorTest < ActiveSupport::TestCase
  # 呼ばれた住民を記録し、決まった応答（または差し替えた応答）を返す
  class SpyResponder
    attr_reader :asked

    def initialize(inner = FixedResponder.default, &hook)
      @inner, @hook, @asked = inner, hook, []
    end

    def call(context)
      @asked << context.fetch("resident_key")
      @hook&.call(context)
      @inner.call(context)
    end
  end

  # 決まった行動案だけを返す応答
  class StubResponder
    def initialize(proposals) = @proposals = proposals
    def call(context)
      me = context.fetch("resident_key")
      { "actor" => me }.merge(@proposals.fetch(me) { { "action_type" => "continue_routine", "target" => nil, "params" => {}, "reason" => "x" } })
    end
  end

  setup do
    guest, = Guest.issue!
    @pt, = Playthrough.start_for!(guest)
  end

  def confirm(time_index = @pt.reload.time_index, responder: FixedResponder.default)
    TimeSlotProcessor.new(@pt, responder: responder).call(time_index: time_index)
  end

  def locations = @pt.residents.reload.to_h { [ _1.key, _1.location_key ] }

  # --- 1時間帯の確定 ---

  test "朝（時間帯0）を確定すると、日課の場所のまま次の時間帯へ進む。誰も会わないので判断は使わない" do
    spy = SpyResponder.new
    result = confirm(0, responder: spy)
    assert_equal :confirmed, result.status
    assert_equal 1, @pt.reload.time_index
    assert_equal({ "a" => "plaza", "b" => "home_b", "c" => "shop" }, locations)
    assert_empty spy.asked, "同じ場所に誰もいない住民は、日課だけで判断を使わない"
    assert_equal "confirmed", TimeSlotRun.find_by!(playthrough: @pt, time_index: 0).status
  end

  test "昼（時間帯1）は日課で動き、同じ場所で会った住民だけが判断し、成立した行動が出来事になる" do
    confirm(0)
    spy = SpyResponder.new
    version = @pt.reload.state_version
    result = confirm(1, responder: spy)
    assert_equal :confirmed, result.status
    assert_equal({ "a" => "plaza", "b" => "shop", "c" => "plaza" }, locations)
    assert_equal %w[a c], spy.asked.sort, "広場で会った a と c だけが判断する（b は店に1人）"
    events = @pt.world_events.where(time_index: 1).order(:actor_key)
    assert_equal [ [ "consulted", "a", "c", nil ], [ "told", "c", "a", "e2" ] ],
                 events.map { [ _1.kind, _1.actor_key, _1.target_key, _1.fact_key ] }
    assert_equal version + 1, @pt.reload.state_version, "AI に渡す状態（場所・出来事）が変わったので版を上げる"
  end

  test "判断の入力は本人の情報と記憶だけで、ほかの住民の記憶は入らない" do
    confirm(0)
    contexts = []
    confirm(1, responder: SpyResponder.new { contexts << _1 })
    a = contexts.find { _1["resident_key"] == "a" }
    assert_equal %w[e1], a["memories"].map { _1["fact_key"] }
    assert_equal %w[c], a["present"], "同じ場所にいる相手だけ"
    refute_includes a.to_s, "急な家族の用事", "a が知らない事実（c の記憶）は入らない"
  end

  # --- Rails の検証 ---

  test "成り立たない行動案は出来事にせず、理由つきで返す" do
    confirm(0)
    bad = StubResponder.new(
      "a" => { "action_type" => "tell", "target" => "c", "params" => { "fact_key" => "e2" }, "reason" => "x" }, # a は e2 を知らない
      "c" => { "action_type" => "invite", "target" => "b", "params" => { "task" => "setup" }, "reason" => "x" } # b は広場にいない
    )
    result = confirm(1, responder: bad)
    assert_equal :confirmed, result.status
    assert_empty @pt.world_events.where(time_index: 1)
    assert_equal({ "a" => [ "本人の記憶にない fact_key を話そうとした" ], "c" => [ "target がその場にいる相手ではない" ] },
                 result.rejected.to_h { [ _1[:actor_key], _1[:errors] ] })
  end

  test "準備の作業が成立すると、祭りの進み具合が1増える" do
    confirm(0)
    work = StubResponder.new("a" => { "action_type" => "work", "target" => nil, "params" => { "task" => "setup" }, "reason" => "x" })
    confirm(1, responder: work)
    assert_equal 1, @pt.reload.festival_progress
    assert_equal 1, @pt.world_events.where(kind: "worked").count
  end

  # --- 二重送信・古い状態・やり直し ---

  test "確定済みの時間帯をもう一度送っても、出来事は増えず、同じ結果を返す" do
    confirm(0)
    confirm(1)
    assert_no_difference -> { WorldEvent.count + TimeSlotRun.count } do
      result = confirm(1)
      assert_equal :already_confirmed, result.status
      assert_equal 2, result.events.size
    end
    assert_equal 2, @pt.reload.time_index
  end

  test "同じ command_id の出来事は2件作れない" do
    confirm(0)
    confirm(1)
    ev = @pt.world_events.first
    assert_raises(ActiveRecord::RecordNotUnique) do
      WorldEvent.insert!(ev.attributes.except("id", "created_at", "updated_at"))
    end
  end

  test "判断の間に状態が変わったら（古い状態から作った案）反映せず、版の不一致で中断する。やり直すと attempt が増える" do
    confirm(0)
    meddle = SpyResponder.new { Playthrough.where(id: @pt.id).update_all("state_version = state_version + 1") }
    result = confirm(1, responder: meddle)
    assert_equal :suspended, result.status
    run = TimeSlotRun.find_by!(playthrough: @pt, time_index: 1)
    assert_equal [ "suspended", "version_mismatch", 1 ], [ run.status, run.suspend_reason, run.attempt ]
    assert_empty @pt.world_events.where(time_index: 1), "古い案は出来事にしない"
    assert_equal 1, @pt.reload.time_index, "時間帯は進めない"
    assert_equal({ "a" => "plaza", "b" => "home_b", "c" => "shop" }, locations, "日課の移動も反映しない")

    result = confirm(1)
    assert_equal :confirmed, result.status
    assert_equal [ "confirmed", 2 ], run.reload.values_at(:status, :attempt)
    assert_equal 2, @pt.world_events.where(time_index: 1).count
  end

  test "処理中の時間帯には、もう1つの処理を始めない" do
    TimeSlotRun.create!(playthrough: @pt, time_index: 0, status: "running", base_state_version: 0)
    assert_equal :conflict, confirm(0).status
    assert_equal 0, @pt.reload.time_index
  end

  test "いまの時間帯と違う時間帯（先の時間帯）は確定しない" do
    assert_equal :conflict, confirm(3).status
    assert_equal 0, @pt.reload.time_index
  end

  test "やり直した後に、前の試行の遅れた結果が届いても反映しない" do
    confirm(0)
    late = nil
    # 判断の途中で、別の試行（attempt 2）が始まって確定まで進んだことにする
    racer = SpyResponder.new do
      next if late
      late = true
      TimeSlotRun.find_by!(playthrough: @pt, time_index: 1).update_columns(attempt: 2, status: "confirmed")
    end
    result = confirm(1, responder: racer)
    assert_equal :discarded, result.status
    assert_empty @pt.world_events.where(time_index: 1)
  end

  # --- 終わり ---

  test "15個目（時間帯14）を確定すると街は終わり、time_index は14のまま" do
    @pt.update_columns(time_index: 14)
    result = confirm(14)
    assert_equal :confirmed, result.status
    @pt.reload
    assert_equal [ "finished", 14 ], [ @pt.status, @pt.time_index ]
    assert @pt.finished_at
    assert_nil @pt.result, "勝敗は #15 で決める"
    assert_equal :conflict, confirm(14 + 1).status
  end
end
