# 住民の定義（config/residents.yml）。DB には保存しない固定のデータ。
# DB 側は residents.key の CHECK 制約で、ここにある key だけを受け付ける
class ResidentCatalog
  PATH = Rails.root.join("config/residents.yml")

  def self.keys
    @keys ||= YAML.safe_load_file(PATH).fetch("residents").map { _1.fetch("key") }.freeze
  end
end
