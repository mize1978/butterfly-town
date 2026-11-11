require "test_helper"

# ER図（docs/er-diagram.md）の「図だけでは伝わらない決まり」を、DB の制約が守ることを確かめる。
# モデルの検証を通さずに DB へ直接書き込み、DB 自身が拒否するかを見る
class CoreTablesConstraintsTest < ActiveSupport::TestCase
  def guest = Guest.create!(token_digest: SecureRandom.hex(32))
  def playthrough(**attrs) = Playthrough.create!({ guest: guest, mission_key: "festival" }.merge(attrs))

  # DB が拒否することを確かめる。拒否されると PostgreSQL はその取引の続きを受け付けないので、
  # セーブポイントの中で試して、拒否された分だけを取り消す
  def assert_rejected(error, &block)
    assert_raises(error) { ActiveRecord::Base.transaction(requires_new: true, &block) }
  end

  # --- 街の持ち主は、ユーザーかゲストのどちらか一方 ---

  test "持ち主が両方空の街は DB が拒否する" do
    assert_rejected(ActiveRecord::CheckViolation) do
      Playthrough.insert!({ mission_key: "festival" })
    end
  end

  test "持ち主が両方入っている街も DB が拒否する" do
    assert_rejected(ActiveRecord::CheckViolation) do
      Playthrough.insert!({ mission_key: "festival", guest_id: guest.id, user_id: 1 })
    end
  end

  # --- 介入は3回まで ---

  test "介入3回は入り、4回目は DB が拒否する" do
    pt = playthrough
    pt.update_columns(interventions_used: 3)
    assert_rejected(ActiveRecord::CheckViolation) { pt.update_columns(interventions_used: 4) }
  end

  test "時間帯は 0〜14 の範囲だけ" do
    pt = playthrough
    pt.update_columns(time_index: 14)
    assert_rejected(ActiveRecord::CheckViolation) { pt.update_columns(time_index: 15) }
  end

  test "status と result は決めた値だけ" do
    pt = playthrough
    assert_rejected(ActiveRecord::CheckViolation) { pt.update_columns(status: "paused") }
    assert_rejected(ActiveRecord::CheckViolation) { playthrough.update_columns(result: "draw") }
  end

  # --- 進行中の街は、同じユーザー・同じミッションで1つだけ ---

  test "同じユーザーの進行中の街は1つだけ。保管した街は何個あってもよい" do
    Playthrough.insert!({ mission_key: "festival", user_id: 1, status: "in_progress" })
    assert_rejected(ActiveRecord::RecordNotUnique) do
      Playthrough.insert!({ mission_key: "festival", user_id: 1, status: "in_progress" })
    end
    2.times { Playthrough.insert!({ mission_key: "festival", user_id: 1, status: "shelved" }) }
  end

  # --- 時間帯の処理 ---

  test "処理中の時間帯は街に1つだけ" do
    pt = playthrough
    TimeSlotRun.create!(playthrough: pt, time_index: 0, status: "running", base_state_version: 0)
    assert_rejected(ActiveRecord::RecordNotUnique) do
      TimeSlotRun.insert!({ playthrough_id: pt.id, time_index: 1, status: "running", base_state_version: 0 })
    end
  end

  test "同じ時間帯の処理は1行だけ（やり直しは attempt を増やす）" do
    pt = playthrough
    TimeSlotRun.create!(playthrough: pt, time_index: 0, status: "confirmed", base_state_version: 0)
    assert_rejected(ActiveRecord::RecordNotUnique) do
      TimeSlotRun.insert!({ playthrough_id: pt.id, time_index: 0, status: "failed", base_state_version: 0 })
    end
  end

  test "別の街なら、それぞれ処理中の時間帯を持てる" do
    TimeSlotRun.create!(playthrough: playthrough, time_index: 0, status: "running", base_state_version: 0)
    TimeSlotRun.create!(playthrough: playthrough, time_index: 0, status: "running", base_state_version: 0)
    assert_equal 2, TimeSlotRun.where(status: "running").count
  end

  # --- 住民キーは設定ファイルにあるものだけ（講師の参考点） ---

  test "設定ファイルに無い住民キーは DB が拒否する" do
    pt = playthrough
    assert_rejected(ActiveRecord::CheckViolation) do
      Resident.insert!({ playthrough_id: pt.id, key: "nobody" })
    end
  end

  test "設定ファイルにある住民キーは入り、同じ街に同じ住民は2人いない" do
    pt = playthrough
    ResidentCatalog.keys.each { |key| Resident.create!(playthrough: pt, key: key) }
    assert_rejected(ActiveRecord::RecordNotUnique) do
      Resident.insert!({ playthrough_id: pt.id, key: ResidentCatalog.keys.first })
    end
  end

  test "DB の住民キーの制約は、設定ファイルのキーと一致している" do
    check = ActiveRecord::Base.connection.check_constraints(:residents).find { _1.name == "residents_key_in_catalog" }
    assert check, "residents_key_in_catalog の CHECK 制約がない"
    assert_equal ResidentCatalog.keys.sort, check.expression.scan(/'([^']+)'/).flatten.sort,
                 "設定ファイルを変えたら、マイグレーションで CHECK 制約も変える"
  end

  # --- 同じものを二重に作らない ---

  test "同じ住民に同じ記憶、同じ街に同じ出来事は2つ作れない" do
    pt = playthrough
    resident = Resident.create!(playthrough: pt, key: ResidentCatalog.keys.first)
    Memory.create!(resident: resident, fact_key: "e1", content: "Bは昨年の準備に参加しなかった", source: "initial")
    assert_rejected(ActiveRecord::RecordNotUnique) do
      Memory.insert!({ resident_id: resident.id, fact_key: "e1", content: "重複", source: "initial" })
    end
    WorldEvent.create!(playthrough: pt, command_id: "cmd-1", kind: "invite", time_index: 0)
    assert_rejected(ActiveRecord::RecordNotUnique) do
      WorldEvent.insert!({ playthrough_id: pt.id, command_id: "cmd-1", kind: "invite", time_index: 0 })
    end
  end

  test "記憶の出どころは決めた値だけ" do
    resident = Resident.create!(playthrough: playthrough, key: ResidentCatalog.keys.first)
    assert_rejected(ActiveRecord::CheckViolation) do
      Memory.insert!({ resident_id: resident.id, fact_key: "e1", content: "x", source: "rumor" })
    end
  end

  test "関係性は同じ組を二重に作れず、自分自身との関係も作れない" do
    pt = playthrough
    a, b = ResidentCatalog.keys
    Relationship.create!(playthrough: pt, from_key: a, toward_key: b)
    assert_rejected(ActiveRecord::RecordNotUnique) do
      Relationship.insert!({ playthrough_id: pt.id, from_key: a, toward_key: b })
    end
    assert_rejected(ActiveRecord::CheckViolation) do
      Relationship.insert!({ playthrough_id: pt.id, from_key: a, toward_key: a })
    end
  end

  test "ゲストの Cookie のハッシュは一意" do
    digest = SecureRandom.hex(32)
    Guest.create!(token_digest: digest)
    assert_rejected(ActiveRecord::RecordNotUnique) { Guest.insert!({ token_digest: digest }) }
  end
end
