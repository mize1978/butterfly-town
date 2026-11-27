require "test_helper"

# #55 誘いへの返事（受ける・断る）・移動・ひとりで判断する条件・判断の入力
class InviteReplyTest < ActiveSupport::TestCase
  CONTINUE = { "action_type" => "continue_routine", "target" => nil, "params" => {}, "reason" => "x" }.freeze

  # 指定した時間帯・住民だけ決まった行動案を返し、それ以外は決まった応答。判断した住民と入力を記録する
  class Script
    attr_reader :contexts

    def initialize(overrides = {}) = (@overrides, @contexts = overrides, [])

    def call(context, **rails_only)
      @contexts << context
      me = context.fetch("resident_key")
      override = @overrides[[ context.fetch("time_index"), me ]]
      override ? { "actor" => me }.merge(override) : FixedResponder.default.call(context, **rails_only)
    end

    def deciders(time_index) = @contexts.select { _1["time_index"] == time_index }.map { _1["resident_key"] }.sort
    def context_of(time_index, key) = @contexts.find { _1["time_index"] == time_index && _1["resident_key"] == key }
  end

  setup do
    @pt = start_playthrough
  end

  def confirm(script, time_index = @pt.reload.time_index) = TimeSlotProcessor.new(@pt, responder: script).call(time_index: time_index)
  def run_until(script, last) = (@pt.reload.time_index..last).map { confirm(script, _1) }
  def resident(key) = resident_of(@pt, key)
  def memory_count = Memory.joins(:resident).where(residents: { playthrough_id: @pt.id }).count
  def rejected(result, key) = result.rejected.find { _1[:actor_key] == key }&.fetch(:errors)
  def reply(to, answer) = { "action_type" => "reply", "target" => to, "params" => { "task" => "setup", "answer" => answer }, "reason" => "x" }

  test "断った場合は declined の出来事だけを残し、記憶・進み具合・関係値は変えない。B は作業の判断をせず、A には「断った」が見える" do
    script = Script.new([ 5, "b" ] => reply("a", "decline"))
    run_until(script, 4)
    @pt.relationships.create!(from_key: "a", toward_key: "b", affinity: 2)
    before = { memories: memory_count, progress: @pt.reload.festival_progress,
               relationships: @pt.relationships.order(:id).pluck(:from_key, :toward_key, :affinity, :note) }

    result = confirm(script, 5)
    assert_equal [ %w[declined b a] ], result.events.map { [ _1.kind, _1.actor_key, _1.target_key ] }
    assert_equal @pt.world_events.find_by!(kind: "invited").id, result.events.first.cause_id
    assert_equal before, { memories: memory_count, progress: @pt.reload.festival_progress,
                           relationships: @pt.relationships.order(:id).pluck(:from_key, :toward_key, :affinity, :note) }

    run_until(script, 14)
    assert_equal 0, @pt.reload.festival_progress
    assert_equal 0, @pt.world_events.where(kind: %w[worked accepted]).count
    assert_equal [], script.deciders(6), "断った B には、朝・昼の作業の判断の機会が無い"
    assert_equal [ { "to" => "b", "task" => "setup", "status" => "declined" } ], script.context_of(7, "a")["my_invites"]
  end

  test "同じ相手・同じ目的の誘いは、未回答のうちにもう一度しても成り立たない" do
    script = Script.new([ 7, "a" ] => { "action_type" => "invite", "target" => "b", "params" => { "task" => "setup" }, "reason" => "x" },
                        [ 5, "b" ] => CONTINUE)
    run_until(script, 6)
    resident("a").update!(current_plan: { "type" => "move", "to" => "shop", "from" => 7, "until" => 7 })

    result = confirm(script, 7)
    assert_includes rejected(result, "a"), "同じ相手・同じ目的の誘いはもうしている"
    assert_equal 1, @pt.world_events.where(kind: "invited").count
  end

  test "受けた・断った後も、同じ相手・同じ目的の誘いは成り立たない" do
    %w[accepted declined].each do |status|
      context = { "resident_key" => "a", "present" => [ "b" ], "memories" => [], "locations" => [],
                  "my_invites" => [ { "to" => "b", "task" => "setup", "status" => status } ], "invites_to_me" => [] }
      proposal = { "actor" => "a", "action_type" => "invite", "target" => "b", "params" => { "task" => "setup" } }
      assert_equal [ "同じ相手・同じ目的の誘いはもうしている" ], ProposalValidator.call(proposal, context), status
    end
  end

  test "返事は自分宛ての未回答の誘いに1回だけ成り立つ（2回目・誘いの無い相手・答えの誤りは成り立たない）" do
    # C は誘われていない（t3 は A と店で会う）。t1 の相談・伝える行動は決まった応答のまま
    script = Script.new([ 3, "c" ] => reply("a", "accept"), [ 6, "b" ] => reply("a", "accept"))
    result = run_until(script, 3).last
    assert_includes rejected(result, "c"), "その相手からの未回答の誘いがない"

    run_until(script, 5) # t5 で B が受ける（決まった応答）
    result = confirm(script, 6)
    assert_includes rejected(result, "b"), "その相手からの未回答の誘いがない"
    assert_equal 1, @pt.world_events.where(kind: %w[accepted declined]).count

    context = { "resident_key" => "b", "present" => [], "memories" => [], "locations" => [], "my_invites" => [],
                "invites_to_me" => [ { "from" => "a", "task" => "setup" } ] }
    assert_includes ProposalValidator.call({ "actor" => "b", "action_type" => "reply", "target" => "c",
                                             "params" => { "task" => "setup", "answer" => "accept" } }, context), "その相手からの未回答の誘いがない"
    assert_includes ProposalValidator.call({ "actor" => "b", "action_type" => "reply", "target" => "a",
                                             "params" => { "task" => "setup", "answer" => "maybe" } }, context), "params.answer は accept か decline のはず"
  end

  test "離れている相手への返事は成り立つが、同じ相手を invite・consult・tell に選ぶと、その場にいないので成り立たない" do
    %w[invite consult tell].each do |type|
      params = { "invite" => { "task" => "setup" }, "consult" => { "about" => "c" }, "tell" => { "fact_key" => "e2" } }.fetch(type)
      setup_playthrough = start_playthrough
      script = Script.new([ 5, "b" ] => { "action_type" => type, "target" => "a", "params" => params, "reason" => "x" })
      (0..4).each { TimeSlotProcessor.new(setup_playthrough, responder: script).call(time_index: _1) }

      result = TimeSlotProcessor.new(setup_playthrough, responder: script).call(time_index: 5)
      assert_equal [], script.context_of(5, "b")["present"], "B はひとり（家）"
      assert_includes result.rejected.find { _1[:actor_key] == "b" }[:errors], "target がその場にいる相手ではない", type
      assert_empty result.events, type
    end

    run_until(Script.new, 5)
    assert_equal %w[accepted b a], @pt.world_events.where(time_index: 5).pluck(:kind, :actor_key, :target_key).first
  end

  test "移動先にいる時間帯は、朝に決めると同じ日の昼・昼に決めると翌日の朝と昼・夜に決めると翌日の朝と昼" do
    assert_equal 1..1, ResidentCatalog.move_window(0)
    assert_equal 3..4, ResidentCatalog.move_window(1)
    assert_equal 3..4, ResidentCatalog.move_window(2)
    assert_equal 13..13, ResidentCatalog.move_window(12)
  end

  test "昼に移動を決めると、その日の夜は家・翌日の朝と昼は移動先・翌日の夜は家にいる" do
    script = Script.new([ 1, "a" ] => { "action_type" => "move", "target" => nil, "params" => { "to" => "shop" }, "reason" => "x" })
    # 時間帯 t の場所＝ t を確定する前に見えている場所（#31：確定したら次の時間帯の場所へ動く）
    seen = (0..5).to_h { |t| at = resident("a").location_key; confirm(script, t); [ t, at ] }
    assert_equal({ 0 => "plaza", 1 => "plaza", 2 => "home_a", 3 => "shop", 4 => "shop", 5 => "home_a" }, seen)
    assert_equal({ "type" => "move", "to" => "shop", "from" => 3, "until" => 4 }, resident("a").current_plan)
  end

  test "判断の入力には未回答の誘い・自分の誘いの結果・いつもの居場所が入り、受けた誘い・ほかの住民の記憶・実際の現在地は入らない" do
    script = Script.new
    run_until(script, 7)

    b5 = script.context_of(5, "b")
    assert_equal [ { "from" => "a", "task" => "setup" } ], b5["invites_to_me"]
    assert_equal [], b5["my_invites"]
    # t5 の時点で A は店から家へ戻っているが、入力に入るのは日課（公開情報）だけ
    assert_equal({ "a" => { "morning" => "plaza", "noon" => "plaza", "night" => "home_a" },
                   "c" => { "morning" => "shop", "noon" => "plaza", "night" => "home_c" } }, b5["usual_places"])
    assert_equal [ "e2" ], b5["memories"].map { _1["fact_key"] }

    b6 = script.context_of(6, "b")
    assert_equal [], b6["invites_to_me"], "受けた後は未回答の誘いに入らない"
    refute(b6.keys.any? { _1.include?("accept") }, "受けた誘いは入力に入れない")
    assert_equal "worked", @pt.world_events.find_by!(time_index: 6).kind, "受けた誘いは Rails 側で作業ルールに使う"

    a3 = script.context_of(3, "a")
    assert_equal "shop", a3["location"]
    assert_equal [ "c" ], a3["present"]
    assert_equal({ "morning" => "home_b", "noon" => "shop", "night" => "home_b" }, a3["usual_places"]["b"])
    assert_equal [ { "to" => "b", "task" => "setup", "status" => "accepted" } ], script.context_of(7, "a")["my_invites"]
  end

  test "受けた後でも、夜は判断の機会が無い。前の時間帯に記憶を得ていなければ、ひとりでは判断しない" do
    script = Script.new
    run_until(script, 8)
    assert_equal [ "b" ], script.deciders(7) - %w[a c]
    assert_equal [], script.deciders(8)
    assert_equal [ "a" ], script.deciders(2), "A は t1 に e2 を聞いたので t2 はひとりでも判断する"
    assert_equal [], script.deciders(0)
  end
end
