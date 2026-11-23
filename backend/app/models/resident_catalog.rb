# 住民の定義（config/residents.yml）。DB には保存しない固定のデータ。
# DB 側は residents.key の CHECK 制約で、ここにある key だけを受け付ける
class ResidentCatalog
  PATH = Rails.root.join("config/residents.yml")
  PARTS = %w[morning noon night].freeze # 1日の時間帯。time_index を3で割った余りの順

  def self.data = @data ||= YAML.safe_load_file(PATH).freeze
  def self.all = data.fetch("residents")
  def self.keys = all.map { _1.fetch("key") }
  def self.find(key) = all.find { _1.fetch("key") == key } || raise(KeyError, "unknown resident #{key}")
  def self.locations = data.fetch("locations")
  def self.fact(key) = data.fetch("facts").fetch(key)

  def self.part_of(time_index) = PARTS[time_index % PARTS.size]
  def self.initial_location(key) = location_at(key, 0)
  # その時間帯に日課で居る場所
  def self.location_at(key, time_index) = find(key).fetch("routine").fetch(part_of(time_index))
  def self.routine(key) = find(key).fetch("routine")

  # 移動を決めた時間帯から、移動先にいる時間帯の範囲（#55）。決めた後に来る最初の朝か昼から、その日の昼まで。
  # 夜は範囲に入らない（日課の場所＝家に戻る）。朝→同じ日の昼、昼→翌日の朝・昼、夜→翌日の朝・昼
  def self.move_window(decided_at)
    case part_of(decided_at)
    when "morning" then decided_at + 1..decided_at + 1
    when "noon" then decided_at + 2..decided_at + 3
    else decided_at + 1..decided_at + 2
    end
  end
end
