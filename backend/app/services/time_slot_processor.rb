# 1時間帯を確定する（#8）。
#
#   1. 受け付け（短いロック）：いまの時間帯か確かめ、時間帯の処理（time_slot_runs）を running にする。
#      やり直しなら同じ行の attempt を1増やす。開始時点の state_version を base_state_version に残す
#   2. 判断（ロックなし）：日課（と移動の予定）で場所を動かした後に、同じ場所に相手がいる住民と、
#      ひとりでも判断する条件（#55）に当てはまる住民だけが応答（決まった応答・実LLM）を使う
#   3. 反映（ロック）：試行番号と state_version が開始時と同じときだけ、成り立つ行動を出来事にし、時間帯を進める。
#      違えば反映しない（古い状態から作った案・前の試行の遅れた結果）
#
# 出来事の command_id は「時間帯・住民」で決まるので、同じ時間帯を2回確定しても出来事は増えない。
# 伝える行動が成立したときだけ、受け手の記憶を作る（#9）。
# 返事（#55）は accepted / declined の出来事だけを残す（記憶・進み具合・関係値は変えない）。
# 移動（#55）は出来事と移動の予定（residents.current_plan）を残し、次の朝か昼から反映する
#
# 費用のかかる応答（実LLM。billable? が true のもの）は、呼ぶ前に AiBudget で予約する（#10）。
# 予算が足りなければ、その時間帯を確定させずに止め（suspended・budget）、再開できる時期を返す。
# Rails が住民の代わりに判断することはしない。結果が分からない呼び出しは自動では呼び直さない（suspended・unknown_result）。
# AI を呼ぶ前に止まった・API が受け付けなかった（課金されていない）ときは suspended・ai_unavailable（#30）。
# API を待つ間（数える・呼ぶ）は、トランザクションの外にいる（街の行も月の予算の行もロックしない）。
# 決まった応答（FixedResponder）は費用がかからないので、予算を通さない。どちらを使うかは ResidentResponder が決める
class TimeSlotProcessor
  Result = Struct.new(:status, :run, :events, :rejected, :error, :resume_at, keyword_init: true)
  EVENT_KINDS = { "invite" => "invited", "consult" => "consulted", "tell" => "told", "work" => "worked", "move" => "moved" }.freeze
  REPLY_KINDS = { "accept" => "accepted", "decline" => "declined" }.freeze

  def initialize(playthrough, responder: ResidentResponder.default, budget: AiBudget.default)
    @playthrough, @responder, @budget = playthrough, responder, budget
  end

  def call(time_index:)
    run = start(time_index)
    return run if run.is_a?(Result)

    attempt, base_version = run.attempt, run.base_state_version
    locations = routine_locations(time_index)
    proposals = begin
      decide(locations, run, attempt, base_version, time_index)
    rescue AiBudget::Exhausted => e
      return suspend(run, attempt, "budget", resume_at: e.resume_at)
    rescue AiBudget::PromptTooLong, AiBudget::UnknownModel, AiBudget::NotBilled, LlmResponder::Unavailable => e
      Rails.logger.warn("[time_slot] AI を呼べなかったため中断（この呼び出しは課金されていない）：#{e.class}")
      return suspend(run, attempt, "ai_unavailable")
    rescue StandardError => e
      raise unless billable?
      Rails.logger.warn("[time_slot] AI の呼び出しが失敗したため中断：#{e.class}")
      return suspend(run, attempt, "unknown_result")
    end
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

  # この時間帯に、住民ごとに居る場所（Rails が決める）。移動の予定の範囲内なら移動先、それ以外は日課の場所
  def routine_locations(time_index)
    @playthrough.residents.to_h do |resident|
      plan = resident.current_plan
      planned = plan && plan["type"] == "move" && (plan.fetch("from")..plan.fetch("until")).cover?(time_index)
      [ resident.key, planned ? plan.fetch("to") : ResidentCatalog.location_at(resident.key, time_index) ]
    end
  end

  # 判断する住民：同じ場所に相手がいる、または、ひとりでも判断する条件に当てはまる。返すのは [住民, 入力, 行動案] の並び
  def decide(locations, run, attempt, base_version, time_index)
    invitations = Invitations.new(@playthrough)
    @playthrough.residents.includes(:memories).sort_by(&:key).filter_map do |resident|
      context = ResidentContext.build(resident, @playthrough, locations: locations, invitations: invitations)
      accepted = invitations.accepted_to(resident.key)
      next unless context["present"].any? || decides_alone?(resident, context, accepted, time_index)

      rails_only = { accepted_invites_to_me: accepted.map { { "from" => _1.from, "task" => _1.task } } }
      [ resident, context, respond(context, rails_only, run, attempt, base_version, time_index) ]
    end
  end

  # ひとりでも判断する条件（#55）。与えるのは判断の機会だけで、何をするかは住民が選ぶ
  #   1. 前の時間帯に、新しく記憶を得た  2. 自分宛てに未回答の誘いがある  3. 受けた誘いがあり、いまが朝か昼
  def decides_alone?(resident, context, accepted, time_index)
    resident.memories.any? { _1.acquired_time_index == time_index - 1 } ||
      context["invites_to_me"].any? ||
      (accepted.any? && ResidentCatalog.part_of(time_index) != "night")
  end

  def billable? = @responder.respond_to?(:billable?) && @responder.billable?

  # 費用のかかる応答は、予約 → 呼び出し → 精算の順に AiBudget を通す（再試行も attempt つきで同じ予算に数える）。
  # rails_only（受けた誘い）は、受け取れる応答（決まった応答）にだけ渡す。実LLM の入力には入れない
  def respond(context, rails_only, run, attempt, base_version, time_index)
    unless billable?
      takes_rails_only = @responder.method(:call).parameters.any? { |kind, _| %i[key keyrest].include?(kind) }
      return takes_rails_only ? @responder.call(context, **rails_only) : @responder.call(context)
    end

    input_tokens, max_output_tokens = @responder.estimate(context)
    @budget.with_call(model: @responder.model, purpose: "decision", input_tokens:, max_output_tokens:,
                      playthrough: @playthrough, guest: @playthrough.guest, time_slot_run: run,
                      attempt:, base_state_version: base_version, base_time_index: time_index) do
      @responder.call_billed(context)
    end
  end

  # 判断の途中で止めた時間帯：確定させず、時間帯も進めない。いまの試行のときだけ記録する。
  # この試行で呼んだ AI の返答は反映しない（費用は予算に数えたまま）
  def suspend(run, attempt, reason, resume_at: nil)
    @playthrough.with_lock do
      run.reload
      next Result.new(status: :discarded, run: run, events: [], rejected: []) unless run.status == "running" && run.attempt == attempt

      run.update!(status: "suspended", suspend_reason: reason)
      mark_calls(run, attempt, "discarded")
      Result.new(status: :suspended, run: run, events: [], rejected: [], error: reason, resume_at: resume_at)
    end
  end

  def mark_calls(run, attempt, applied)
    AiCall.where(time_slot_run: run, attempt: attempt, applied: "pending").update_all(applied: applied, updated_at: Time.current)
  end

  def apply(run, attempt, base_version, time_index, locations, proposals)
    @playthrough.with_lock do
      run.reload
      next Result.new(status: :discarded, run: run, events: [], rejected: []) unless run.status == "running" && run.attempt == attempt

      if @playthrough.state_version != base_version
        run.update!(status: "suspended", suspend_reason: "version_mismatch")
        mark_calls(run, attempt, "discarded")
        next Result.new(status: :suspended, run: run, events: [], rejected: [], error: "version_mismatch")
      end

      changed = move(locations)
      events, rejected = [], []
      proposals.each do |resident, context, proposal|
        errors = ProposalValidator.call(proposal, context)
        errors += told_errors(proposal) if errors.empty? && proposal["action_type"] == "tell"
        next rejected << { actor_key: resident.key, action_type: proposal["action_type"], errors: errors } if errors.any?

        kind = event_kind(proposal)
        next unless kind # continue_routine は出来事にしない

        event = record(resident, kind, proposal, time_index, cause: reply_cause(resident, proposal))
        events << event
        @playthrough.festival_progress += 1 if kind == "worked"
        learn!(resident, event) if kind == "told"
        plan_move!(resident, proposal, time_index) if kind == "moved"
      end
      @playthrough.state_version += 1 if changed || events.any?
      finish_slot(time_index)
      @playthrough.save!
      run.update!(status: "confirmed")
      mark_calls(run, attempt, "applied")
      Result.new(status: :confirmed, run: run, events: events, rejected: rejected)
    end
  end

  def move(locations)
    @playthrough.residents.reject { locations.fetch(_1.key) == _1.location_key }
                .each { _1.update!(location_key: locations.fetch(_1.key)) }.any?
  end

  def event_kind(proposal)
    return REPLY_KINDS.fetch(proposal.dig("params", "answer")) if proposal["action_type"] == "reply"

    EVENT_KINDS[proposal["action_type"]]
  end

  # 返事は、返事をした住民宛ての未回答の誘い（検証済み）を cause にする
  def reply_cause(resident, proposal)
    return nil unless proposal["action_type"] == "reply"

    Invitations.new(@playthrough).pending_from(from: proposal["target"], to: resident.key, task: proposal.dig("params", "task")).event
  end

  # 移動の予定：決めた後に来る最初の朝か昼から、その日の昼まで移動先にいる（夜は日課の場所）
  def plan_move!(resident, proposal, time_index)
    window = ResidentCatalog.move_window(time_index)
    resident.update!(current_plan: { "type" => "move", "to" => proposal.dig("params", "to"), "from" => window.begin, "until" => window.end },
                     plan_time_index: time_index)
  end

  def record(resident, kind, proposal, time_index, cause: nil)
    params = proposal["params"] || {}
    @playthrough.world_events.create!(
      command_id: "slot#{time_index}-#{resident.key}", kind: kind, actor_key: resident.key, target_key: proposal["target"],
      time_index: time_index, fact_key: params["fact_key"], cause: cause,
      payload: { "params" => params, "reason" => proposal["reason"], "rule_id" => proposal["rule_id"] }.compact
    )
  end

  # 伝える相手がもう知っている事実は、伝える行動として成り立たせない（受け手の記憶は1つの事実に1つ）。
  # 相手の記憶は判断の入力には入れず、ここで Rails だけが見る。同じ時間帯に先に伝わった分も数える
  def told_errors(proposal)
    target = @playthrough.residents.find_by!(key: proposal["target"])
    target.memories.exists?(fact_key: proposal.dig("params", "fact_key")) ? [ "相手はもうその事実を知っている" ] : []
  end

  # 伝える行動が成立したときだけ、受け手の記憶を作る（#9）。伝わるのは伝えた本人の記憶の内容（伝聞）で、
  # 受け手の解釈はまだ無い。出どころの出来事（source_event）で、いつ誰から聞いたかをたどれる
  def learn!(teller, event)
    told = teller.memories.find_by!(fact_key: event.fact_key)
    receiver = @playthrough.residents.find_by!(key: event.target_key)
    receiver.memories.create!(fact_key: event.fact_key, content: told.content, interpretation: nil, source: "told",
                              acquired_time_index: event.time_index, source_event: event)
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
