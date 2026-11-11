require "test_helper"

# #9 情報伝播と住民ごとの記憶。伝える行動が成立したときだけ、受け手の記憶を出どころの出来事つきで作る
class ToldMemoriesTest < ActiveSupport::TestCase
  # 決まった応答のまま、判断に渡った入力を記録する
  class Recorder
    attr_reader :contexts

    def initialize = @contexts = []
    def call(context) = FixedResponder.default.call(context).tap { @contexts << context }
  end

  # 決まった行動案だけを返す応答（指定の無い住民はいつもの日課）
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

  def memories_of(key) = @pt.residents.find_by!(key: key).memories.order(:id)

  test "伝える行動が成立すると、受け手の記憶が出どころの出来事つきでできる" do
    confirm(0)
    confirm(1) # 昼、広場で c が a に e2 を伝える
    told = @pt.world_events.find_by!(time_index: 1, kind: "told")
    memory = memories_of("a").find_by!(fact_key: "e2")
    assert_equal "told", memory.source
    assert_equal told, memory.source_event
    assert_equal 1, memory.acquired_time_index
    assert_equal memories_of("c").find_by!(fact_key: "e2").content, memory.content, "伝わるのは、伝えた本人の記憶の内容"
    assert_nil memory.interpretation, "受け手の解釈はまだ無い"
  end

  test "伝わった記憶が、次に判断するときの入力に入り、判断が変わる" do
    confirm(0)
    recorder = Recorder.new
    confirm(1, responder: recorder)
    before = recorder.contexts.find { _1["resident_key"] == "a" }
    assert_equal %w[e1], before["memories"].map { _1["fact_key"] }

    confirm(2) # 夜（会わない）
    confirm(3) # 2日目の朝（会わない）
    recorder = Recorder.new
    result = confirm(4, responder: recorder) # 2日目の昼、また広場で会う
    after = recorder.contexts.find { _1["resident_key"] == "a" }
    assert_equal %w[e1 e2], after["memories"].map { _1["fact_key"] }
    assert_equal({ "fact_key" => "e2", "source" => "told" }, after["memories"].last.slice("fact_key", "source"))
    # e2 を知った a は「b を誘う」を選ぶ（b は店にいるので、この時間帯には成り立たない）
    assert_equal({ "actor_key" => "a", "action_type" => "invite", "errors" => [ "target がその場にいる相手ではない" ] },
                 result.rejected.find { _1[:actor_key] == "a" }.transform_keys(&:to_s))
  end

  test "同じ時間帯を再送しても、記憶は増えない" do
    confirm(0)
    confirm(1)
    assert_no_difference -> { Memory.count } do
      assert_equal :already_confirmed, confirm(1).status
    end
    assert_equal 1, memories_of("a").where(fact_key: "e2").count
  end

  test "相手がもう知っている事実は、伝える行動として成立させず、記憶も作らない" do
    confirm(0)
    confirm(1)
    confirm(2)
    confirm(3)
    assert_no_difference -> { Memory.count } do
      result = confirm(4) # c はまた a に e2 を伝えようとする
      assert_includes result.rejected.find { _1[:actor_key] == "c" }[:errors], "相手はもうその事実を知っている"
    end
    assert_equal 1, @pt.world_events.where(kind: "told").count
  end

  test "相談しただけ・成り立たなかった伝える行動では、記憶を作らない" do
    confirm(0)
    stub = StubResponder.new(
      "a" => { "action_type" => "consult", "target" => "c", "params" => { "about" => "b" }, "reason" => "x" },
      "c" => { "action_type" => "tell", "target" => "b", "params" => { "fact_key" => "e2" }, "reason" => "x" } # b は広場にいない
    )
    assert_no_difference -> { Memory.count } do
      confirm(1, responder: stub)
    end
    assert_equal [ "consulted" ], @pt.world_events.where(time_index: 1).pluck(:kind)
  end

  test "古い状態から作った案で中断したときは、記憶も作らない" do
    confirm(0)
    meddle = Class.new do
      def initialize(pt) = @pt = pt
      def call(context)
        Playthrough.where(id: @pt.id).update_all("state_version = state_version + 1")
        FixedResponder.default.call(context)
      end
    end.new(@pt)
    assert_no_difference -> { Memory.count } do
      assert_equal :suspended, confirm(1, responder: meddle).status
    end
  end
end
