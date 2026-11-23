# 特殊介入（#33）。A と B を合わせて1プレイ3回まで（Playthrough::INTERVENTIONS・DB の CHECK）。
#   rumor（うわさを流す）：選んだ住民に、カタログの事実（e1・e2）を1つ知らせる。知らなければ記憶（source: rumor）になり、
#     その時間帯にひとりで判断する機会になる。もう知っていても1回消費し、出来事も残す（答えは同じにして、記憶を漏らさない）
#   gathering（集まる場を作る）：選んだ場所（広場・店）で、次の朝か昼に集まりを開くと告知する。住民全員がその時間帯に判断する機会を得る。
#     行くかどうかは住民が選ぶ。開かれた時間帯に、その場所にいた住民を TimeSlotProcessor が記録する
#
# どちらも住民の行動は決めない。住民の場所・移動の予定・作業・進み具合は、次の判断まで変わらない。
# 街の行のロックの中で、終わった街・処理中の時間帯・回数切れ・間に合わない告知を、回数を消費せずに断る。
# 出来事の command_id は request_id から作るので、同じ送信を2回受けても1回分になる（中身が違えば断る）
class Intervention
  KINDS = %w[rumor gathering].freeze
  # 集まりを開ける場所。画面（frontend/src/game/intervention.ts の GATHERING_PLACES）と同じ。家は選べない
  GATHERING_PLACES = %w[plaza shop].freeze
  Result = Struct.new(:status, :event, :error, keyword_init: true)

  def initialize(playthrough) = @playthrough = playthrough

  # status：:applied（成立）・:already_applied（同じ送信の再送）・:invalid（入力の誤り）・:conflict（断った）
  def call(kind:, request_id:, target: nil, fact_key: nil, place: nil)
    request = { "kind" => kind, "target" => target, "fact_key" => fact_key, "place" => place }.compact
    error = invalid_reason(request, request_id)
    return Result.new(status: :invalid, error: error) if error

    @playthrough.with_lock do
      command_id = "intervention-#{request_id}"
      done = @playthrough.world_events.find_by(command_id: command_id)
      next(done.payload["request"] == request ? Result.new(status: :already_applied, event: done) : conflict("request_conflict")) if done
      next conflict("finished") unless @playthrough.status == "in_progress"
      next conflict("running") if @playthrough.time_slot_runs.exists?(time_index: @playthrough.time_index, status: "running")
      next conflict("no_interventions_left") if @playthrough.interventions_used >= Playthrough::INTERVENTIONS

      kind == "rumor" ? rumor(request, command_id) : gathering(request, command_id)
    end
  end

  private

  def conflict(error) = Result.new(status: :conflict, error: error)

  def invalid_reason(request, request_id)
    return "invalid_request_id" unless request_id.is_a?(String) && request_id.match?(/\A[\w-]{1,64}\z/)
    return "invalid_kind" unless KINDS.include?(request["kind"])

    if request["kind"] == "rumor"
      return "invalid_target" unless ResidentCatalog.keys.include?(request["target"])
      return "invalid_fact" unless ResidentCatalog.data.fetch("facts").key?(request["fact_key"])
    else
      return "invalid_place" unless GATHERING_PLACES.include?(request["place"])
    end
    nil
  end

  def rumor(request, command_id)
    t = @playthrough.time_index
    event = record("rumored", command_id, request, target_key: request["target"], fact_key: request["fact_key"])
    resident = @playthrough.residents.find_by!(key: request["target"])
    unless resident.memories.exists?(fact_key: request["fact_key"])
      resident.memories.create!(fact_key: request["fact_key"], content: ResidentCatalog.fact(request["fact_key"]),
                                interpretation: nil, source: "rumor", acquired_time_index: t, source_event: event)
    end
    consume!
    Result.new(status: :applied, event: event)
  end

  def gathering(request, command_id)
    at = ResidentCatalog.gathering_slot(@playthrough.time_index)
    return conflict("too_late") if at > Playthrough::TIME_SLOTS - 1

    event = record("gathering_announced", command_id, request, extra: { "place" => request["place"], "at" => at })
    consume!
    Result.new(status: :applied, event: event)
  end

  def record(kind, command_id, request, target_key: nil, fact_key: nil, extra: {})
    @playthrough.world_events.create!(command_id: command_id, kind: kind, actor_key: "player", target_key: target_key,
                                      fact_key: fact_key, time_index: @playthrough.time_index,
                                      payload: { "request" => request }.merge(extra))
  end

  # 回数を1つ使い、街の版を進める（判断の途中だった時間帯は、古い状態からの案として反映しない）
  def consume!
    @playthrough.update!(interventions_used: @playthrough.interventions_used + 1, state_version: @playthrough.state_version + 1)
  end
end
