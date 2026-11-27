require "test_helper"

# #31：画面に見えている住民の場所（state の residents）と、その時間帯の判断・集まりで Rails が使う場所が同じであること。
# 時間帯 t を確定する前に見えている場所で、t の「同じ場所にいる相手」と集まりの参加者が決まる
class TimeSlotLocationTest < ActiveSupport::TestCase
  # 判断した住民ごとに、判断の入力にある自分の場所と、同じ場所にいる相手を残す
  class Recorder
    attr_reader :seen

    def initialize = @seen = {}

    def call(context, **rails_only)
      @seen[[ context.fetch("time_index"), context.fetch("resident_key") ]] = context.slice("location", "present")
      FixedResponder.default.call(context, **rails_only)
    end
  end

  setup { @pt = start_playthrough }

  def visible = @pt.reload.state[:residents].to_h { [ _1[:key], _1[:location_key] ] }
  def confirm(recorder, t) = TimeSlotProcessor.new(@pt, responder: recorder).call(time_index: t)

  test "15時間帯とも、確定する前に見えている場所で、その時間帯の判断（自分の場所・同じ場所の相手）が決まる" do
    recorder = Recorder.new
    Playthrough::TIME_SLOTS.times do |t|
      shown = visible
      assert_equal :confirmed, confirm(recorder, t).status, "時間帯#{t}"
      recorder.seen.select { |(slot, _), _| slot == t }.each do |(_, key), ctx|
        assert_equal shown[key], ctx["location"], "時間帯#{t}の住民#{key}の場所"
        assert_equal shown.select { |k, loc| k != key && loc == shown[key] }.keys.sort, ctx["present"], "時間帯#{t}の住民#{key}と同じ場所の相手"
      end
    end
    assert recorder.seen.keys.map(&:first).uniq.size > 5, "判断が何度か起きている（確かめた対象が空でない）"
  end

  test "集まりの参加者は、開かれる時間帯に見えている場所（広場にいる住民）と同じ" do
    recorder = Recorder.new
    (0..1).each { confirm(recorder, _1) }
    Intervention.new(@pt).call(kind: "gathering", request_id: "g-1", place: "plaza")
    confirm(recorder, 2)
    shown = visible
    assert_equal 3, @pt.time_index
    confirm(recorder, 3)
    held = @pt.world_events.find_by!(kind: "gathering_held")
    assert_equal 3, held.time_index
    assert_equal shown.select { _2 == "plaza" }.keys.sort, held.payload["attendees"]
    assert_equal [ "b" ], held.payload["attendees"], "B だけが来る（#33 の筋書きと同じ）"
  end
end
