# 1時間帯を確定する（#8）。
#
#   1. 受け付け（短いロック）：いまの時間帯か確かめ、時間帯の処理（time_slot_runs）を running にする。
#      やり直しなら同じ行の attempt を1増やす。開始時点の state_version を base_state_version に残す
#   2. 判断（ロックなし）：日課で場所を動かした後に、同じ場所に相手がいる住民だけが応答（決まった応答・実LLM）を使う
#   3. 反映（ロック）：試行番号と state_version が開始時と同じときだけ、成り立つ行動を出来事にし、時間帯を進める。
#      違えば反映しない（古い状態から作った案・前の試行の遅れた結果）
#
# 出来事の command_id は「時間帯・住民」で決まるので、同じ時間帯を2回確定しても出来事は増えない
class TimeSlotProcessor
  Result = Struct.new(:status, :run, :events, :rejected, :error, keyword_init: true)
  EVENT_KINDS = { "invite" => "invited", "consult" => "consulted", "tell" => "told", "work" => "worked", "move" => "moved" }.freeze

  def initialize(playthrough, responder: FixedResponder.default)
    @playthrough, @responder = playthrough, responder
  end

  def call(time_index:)
    run = start(time_index)
    return run if run.is_a?(Result)

    attempt, base_version = run.attempt, run.base_state_version
    locations = routine_locations(time_index)
    proposals = decide(locations)
    apply(run, attempt, base_version, time_index, locations, proposals)
  end

  private

  def start(time_index)
    @playthrough.with_lock do
      run = @playthrough.time_slot_runs.find_by(time_index: time_index)
      next finished(run) if run&.status == "confirmed"
      next conflict("finished") unless @playthrough.status == "in_progress"
      next conflict("time_index_mismatch") unless time_index == @playthrough.time_index
      next conflict("running") if run&.status == "running"

      if run
        run.update!(status: "running", attempt: run.attempt + 1, base_state_version: @playthrough.state_version, suspend_reason: nil)
        run
      else
        @playthrough.time_slot_runs.create!(time_index: time_index, status: "running", base_state_version: @playthrough.state_version)
      end
    end
  end

  # 日課：この時間帯に、住民ごとに居る場所（Rails が決める）
  def routine_locations(time_index)
    @playthrough.residents.to_h { [ _1.key, ResidentCatalog.location_at(_1.key, time_index) ] }
  end

  # 同じ場所に相手がいる住民だけが判断する。返すのは [住民, 入力, 行動案] の並び
  def decide(locations)
    @playthrough.residents.includes(:memories).sort_by(&:key).filter_map do |resident|
      context = ResidentContext.build(resident, @playthrough, locations: locations)
      next if context["present"].empty?

      [ resident, context, @responder.call(context) ]
    end
  end

  def apply(run, attempt, base_version, time_index, locations, proposals)
    @playthrough.with_lock do
      run.reload
      next Result.new(status: :discarded, run: run, events: [], rejected: []) unless run.status == "running" && run.attempt == attempt

      if @playthrough.state_version != base_version
        run.update!(status: "suspended", suspend_reason: "version_mismatch")
        next Result.new(status: :suspended, run: run, events: [], rejected: [], error: "version_mismatch")
      end

      changed = move(locations)
      events, rejected = [], []
      proposals.each do |resident, context, proposal|
        errors = ProposalValidator.call(proposal, context)
        next rejected << { actor_key: resident.key, action_type: proposal["action_type"], errors: errors } if errors.any?

        kind = EVENT_KINDS[proposal["action_type"]]
        next unless kind # continue_routine は出来事にしない

        events << record(resident, kind, proposal, time_index)
        @playthrough.festival_progress += 1 if kind == "worked"
      end
      @playthrough.state_version += 1 if changed || events.any?
      finish_slot(time_index)
      @playthrough.save!
      run.update!(status: "confirmed")
      Result.new(status: :confirmed, run: run, events: events, rejected: rejected)
    end
  end

  def move(locations)
    @playthrough.residents.reject { locations.fetch(_1.key) == _1.location_key }
                .each { _1.update!(location_key: locations.fetch(_1.key)) }.any?
  end

  def record(resident, kind, proposal, time_index)
    params = proposal["params"] || {}
    @playthrough.world_events.create!(
      command_id: "slot#{time_index}-#{resident.key}", kind: kind, actor_key: resident.key, target_key: proposal["target"],
      time_index: time_index, fact_key: params["fact_key"],
      payload: { "params" => params, "reason" => proposal["reason"], "rule_id" => proposal["rule_id"] }.compact
    )
  end

  # 最後の時間帯（14）を確定したら終わる。time_index は14のまま（勝敗は #15）
  def finish_slot(time_index)
    if time_index == Playthrough::TIME_SLOTS - 1
      @playthrough.status = "finished"
      @playthrough.finished_at = Time.current
    else
      @playthrough.time_index = time_index + 1
    end
  end

  def finished(run)
    Result.new(status: :already_confirmed, run: run, events: @playthrough.world_events.where(time_index: run.time_index).order(:id).to_a, rejected: [])
  end

  def conflict(error) = Result.new(status: :conflict, events: [], rejected: [], error: error)
end
