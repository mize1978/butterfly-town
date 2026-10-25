# 試作限定ルール：plazaでのsetup作業を1単位だけ実施する。
# 意図の入力、相手の承諾、作業の成立を別々の確定イベントにする。
# 情報伝達（told）は、伝える側が知っている事実だけを、同じ場所にいる相手へ伝えられる。
class FixedActionProcessor
  class InvalidAction < StandardError; end
  RESIDENTS = %w[A B C].freeze
  KEYS = %w[command_id kind actor target task fact_key step cause_id].freeze
  SETUP_KINDS = %w[invited accepted declined worked].freeze
  # 固定応答（AI側の行動案）の action_type → Rails側の確定イベント種別
  PROPOSAL_KINDS = {"invite" => "invited", "work" => "worked", "tell" => "told"}.freeze

  # 行動案をコマンドへ変換するだけで、成立の判断はしない（判断は call で行う）。
  def self.command_from(proposal, command_id:, step:, cause_id: nil)
    proposal = proposal.stringify_keys
    params = proposal.fetch("params", {}).stringify_keys
    kind = PROPOSAL_KINDS.fetch(proposal["action_type"]) { raise InvalidAction, "unsupported action" }
    {command_id: command_id, kind: kind, actor: proposal["actor"], target: proposal["target"],
     task: params["task"], fact_key: params["fact_key"], step: step, cause_id: cause_id}
  end

  def initialize(run)
    @run = run
  end

  def call(input)
    command = input.stringify_keys
    raise InvalidAction, "unknown fields" unless (command.keys - KEYS).empty?
    raise InvalidAction, "invalid command id" unless command["command_id"].is_a?(String) && command["command_id"].match?(/\A[a-zA-Z0-9_-]{1,80}\z/)
    @run.with_lock do
      existing = @run.confirmed_events.find_by(command_id: command["command_id"])
      if existing
        raise InvalidAction, "command id reused with different input" unless existing.command == command
        next existing
      end
      validate_common!(command)
      cause = validate_transition!(command)
      event = @run.confirmed_events.create!(
        command_id: command.fetch("command_id"), kind: command.fetch("kind"),
        actor: command.fetch("actor"), target: command["target"], task: command["task"],
        fact_key: command["fact_key"], step: command.fetch("step"), cause_id: cause&.id, command: command
      )
      @run.update!(progress: @run.progress + 1) if command["kind"] == "worked"
      learn!(event) if command["kind"] == "told"
      event
    end
  end

  private

  def validate_common!(c)
    raise InvalidAction, "unknown resident" unless RESIDENTS.include?(c["actor"])
    raise InvalidAction, "stale or invalid step" unless c["step"].is_a?(Integer) && c["step"] == @run.step
  end

  def validate_setup!(c)
    raise InvalidAction, "unknown task" unless c["task"] == "setup"
    raise InvalidAction, "unexpected fact" if c["fact_key"]
    raise InvalidAction, "actor not at task location" unless @run.locations[c["actor"]] == "plaza"
  end

  def validate_transition!(c)
    return validate_tell!(c) if c["kind"] == "told"
    raise InvalidAction, "unsupported action" unless SETUP_KINDS.include?(c["kind"])
    validate_setup!(c)
    case c["kind"]
    when "invited"
      raise InvalidAction, "unexpected cause" if c["cause_id"]
      raise InvalidAction, "invalid target" unless RESIDENTS.include?(c["target"]) && c["target"] != c["actor"]
      raise InvalidAction, "target not present" unless @run.locations[c["target"]] == "plaza"
      nil
    when "accepted", "declined"
      cause = cause!(c, "invited")
      raise InvalidAction, "wrong invitee" unless c["actor"] == cause.target && c["target"] == cause.actor
      raise InvalidAction, "already answered" if @run.confirmed_events.where(cause_id: cause.id, kind: %w[accepted declined]).exists?
      cause
    when "worked"
      cause = cause!(c, "accepted")
      raise InvalidAction, "wrong worker" unless c["actor"] == cause.actor && c["target"].nil?
      raise InvalidAction, "task already complete" unless @run.progress.zero?
      cause
    end
  end

  def validate_tell!(c)
    raise InvalidAction, "unexpected task" if c["task"]
    raise InvalidAction, "unexpected cause" if c["cause_id"]
    raise InvalidAction, "invalid target" unless RESIDENTS.include?(c["target"]) && c["target"] != c["actor"]
    location = @run.locations[c["actor"]]
    raise InvalidAction, "target not present" unless location && @run.locations[c["target"]] == location
    raise InvalidAction, "invalid fact key" unless c["fact_key"].is_a?(String)
    # 世界の真実ではなく、伝える本人の記憶にあるかどうかで判定する
    raise InvalidAction, "actor does not know fact" unless @run.memories.known_at(c["step"]).exists?(owner: c["actor"], fact_key: c["fact_key"])
    # 受け手の記憶は (owner, fact_key) で一意のため、取得時点にかかわらず既にあれば作れない
    raise InvalidAction, "target already knows fact" if @run.memories.exists?(owner: c["target"], fact_key: c["fact_key"])
    nil
  end

  # 伝わる内容は伝えた本人の記憶の内容（伝聞）。元の出来事とはfact_keyで、伝わった経緯はsource_eventでつながる。
  def learn!(event)
    teller_memory = @run.memories.known_at(event.step).find_by!(owner: event.actor, fact_key: event.fact_key)
    @run.memories.create!(
      owner: event.target, fact_key: event.fact_key, content: teller_memory.content,
      source: "told", acquired_step: event.step, source_event: event
    )
  end

  def cause!(c, kind)
    raise InvalidAction, "invalid cause id" unless c["cause_id"].is_a?(Integer)
    event = @run.confirmed_events.find_by(id: c["cause_id"], kind: kind, task: c["task"])
    raise InvalidAction, "missing causal event" unless event && event.step <= c["step"]
    event
  end
end
