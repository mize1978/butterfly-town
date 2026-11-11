# 住民の定義（config/residents.yml）。DB には保存しない固定のデータ。
# DB 側は residents.key の CHECK 制約で、ここにある key だけを受け付ける
class ResidentCatalog
  PATH = Rails.root.join("config/residents.yml")

  def self.all
    @all ||= YAML.safe_load_file(PATH).fetch("residents").map(&:freeze).freeze
  end

  def self.keys = all.map { _1.fetch("key") }
end
