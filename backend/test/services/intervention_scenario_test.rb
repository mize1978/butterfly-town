require "test_helper"

# #33 特殊介入（うわさを流す・集まる場を作る）の通し。決まった応答で時間帯を進め、
# 介入の直後は介入の出来事だけが残り（うわさは記憶も）、住民の移動・作業・進み具合は次の判断まで変わらないことを見る
class InterventionScenarioTest < ActiveSupport::TestCase
  class Recorder
    attr_reader :deciders

    def initialize = @deciders = Hash.new { |h, k| h[k] = [] }

    def call(context, **rails_only)
      @deciders[context.fetch("time_index")] << context.fetch("resident_key")
      FixedResponder.default.call(context, **rails_only)
    end
  end

  setup { @pt = start_playthrough }

  def intervene(**args) = Intervention.new(@pt).call(**args)
  def confirm(recorder, t) = TimeSlotProcessor.new(@pt, responder: recorder).call(time_index: t)
  def summarize(events) = events.map { [ _1.kind, _1.actor_key, _1.target_key ].compact.join(":") }

  # 住民の移動・作業・進み具合（介入の直後に変わってはいけないもの）
  def world
    @pt.reload
    { locations: @pt.residents.order(:key).pluck(:key, :location_key, :current_plan), progress: @pt.festival_progress,
      worked: @pt.world_events.where(kind: %w[worked moved invited accepted declined]).count }
  end

  test "うわさ：t0 の前に A へ e2 を流すと、A は t0 にひとりで判断して店へ向かい、t1 に B を誘い、作業8回・進み具合8になる" do
    before = world
    result = intervene(kind: "rumor", request_id: "r-1", target: "a", fact_key: "e2")
    assert_equal :applied, result.status
    # 介入の直後：介入の出来事と、うわさの記憶だけが増える。移動・作業・進み具合は変わらない
    assert_equal [ "rumored:player:a" ], summarize(@pt.world_events.order(:id))
    assert_equal before, world
    memory = resident_of(@pt, "a").memories.find_by!(fact_key: "e2")
    assert_equal [ "rumor", 0, result.event.id ], [ memory.source, memory.acquired_time_index, memory.source_event_id ]
    assert_equal 2, @pt.reload.state[:interventions_left]

    recorder = Recorder.new
    events = (0..14).to_h { |t| [ t, summarize(confirm(recorder, t).events) ] }
    assert_equal %w[moved:a], events[0]
    assert_equal %w[a], recorder.deciders[0], "A はうわさを得た時間帯にひとりで判断する"
    assert_equal %w[invited:a:b], events[1]
    assert_equal %w[accepted:b:a], events[2]
    @pt.reload
    assert_equal [ 3, 4, 6, 7, 9, 10, 12, 13 ], @pt.world_events.where(kind: "worked").order(:time_index).pluck(:time_index)
    assert_equal 8, @pt.festival_progress
    assert_equal "finished", @pt.status
  end

  test "集まり：t2（1日目の夜）に広場の集まりを告知すると t3 に開かれる。行くかは住民が選び、B だけが来る" do
    recorder = Recorder.new
    (0..1).each { confirm(recorder, _1) }
    before = world
    result = intervene(kind: "gathering", request_id: "g-1", place: "plaza")
    assert_equal :applied, result.status
    assert_equal({ "place" => "plaza", "at" => 3 }, result.event.payload.slice("place", "at"))
    # 介入の直後：告知の出来事だけが増え、移動・作業・進み具合は変わらない
    assert_equal %w[gathering_announced:player], summarize(@pt.world_events.where(time_index: 2))
    assert_equal before, world

    events = (2..5).to_h { |t| [ t, summarize(confirm(recorder, t).events) ] }
    # t2：告知を知った3人とも判断する。A は B のいつもの店へ、B は集まりへ向かう。C は行かない
    assert_equal %w[a b c], recorder.deciders[2].sort
    assert_equal %w[moved:a moved:b], events[2].sort
    held = @pt.world_events.find_by!(kind: "gathering_held")
    assert_equal [ 3, "plaza", [ "b" ], result.event.id ], [ held.time_index, held.payload["place"], held.payload["attendees"], held.cause_id ]
    # 移動の範囲は #55 のまま（夜に決めた B は t3・t4 が広場、t5 は家）
    assert_equal({ 3 => "plaza", 4 => "plaza", 5 => "home_b" }, (3..5).to_h { |t| [ t, b_location_at(t) ] })
  end

  def b_location_at(time_index)
    plan = resident_of(@pt, "b").current_plan
    planned = plan && (plan["from"]..plan["until"]).cover?(time_index)
    planned ? plan["to"] : ResidentCatalog.location_at("b", time_index)
  end
end
