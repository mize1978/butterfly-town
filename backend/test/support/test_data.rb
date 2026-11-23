# テストデータの作り方（#47）。すべてのテスト（ActiveSupport::TestCase）で使える。
#
# 方針：FactoryBot は入れず、Rails の fixtures（ユーザー：test/fixtures/users.yml）と、このヘルパーにそろえる。
# - 住民と最初の記憶は config/residents.yml から Playthrough.start_for! が作る。工場（factory）で別に定義すると、
#   カタログ・DB の CHECK 制約と食い違いうるので、本番と同じ入口を通す
# - AI 呼び出しは AiBudget#reserve! を通して作る（月の予約額と ai_calls の行が必ずそろう）
# - DB の制約そのものを確かめるテストだけは、検証や入口を通さない行が要るので empty_playthrough を使う
module TestData
  # ゲスト（クッキーのトークンは使わないので捨てる）
  def new_guest = Guest.issue!.first

  # 遊べる状態の街：住民3人・最初の場所・最初の記憶つき（本番の「ゲストで遊ぶ」と同じ）
  def start_playthrough(guest = new_guest) = Playthrough.start_for!(guest).first

  # 住民も記憶も無い街（DB の制約を確かめるテスト用）
  def empty_playthrough(guest: new_guest, **attrs) = Playthrough.create!({ guest: guest, mission_key: Playthrough::MISSION }.merge(attrs))

  def resident_of(playthrough, key) = playthrough.residents.find_by!(key: key)

  # 住民を1人足す（empty_playthrough の街に、制約を確かめるために入れるとき）
  def add_resident(playthrough, key) = playthrough.residents.create!(key: key)

  # 記憶を1つ足す。中身は config/residents.yml の facts から取る
  def add_memory(resident, fact_key, source: "told", **attrs)
    resident.memories.create!({ fact_key: fact_key, content: ResidentCatalog.fact(fact_key), source: source }.merge(attrs))
  end

  # 時間帯の処理の行。版は指定が無ければ街のいまの版
  def time_slot_run(playthrough, time_index: 0, status: "running", **attrs)
    playthrough.time_slot_runs.create!({ time_index: time_index, status: status,
                                         base_state_version: playthrough.state_version }.merge(attrs))
  end

  # AI 呼び出し（予約済み）。月の予算を通すので、予約額も同じだけ増える。
  # owner には playthrough:・guest:・time_slot_run:・attempt: などを渡す（無ければ開発検証の呼び出し）
  def reserve_ai_call(purpose: "dev", model: "claude-haiku-5-5", input_tokens: 2000, max_output_tokens: 300,
                      now: Time.current, budget: AiBudget.default, **owner)
    budget.reserve!(purpose:, model:, input_tokens:, max_output_tokens:, now:, **owner)
  end
end
