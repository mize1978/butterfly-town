# 街ごとの AI 住民。key は config/residents.yml にあるものだけ（DB の CHECK 制約で守る）
class CreateResidents < ActiveRecord::Migration[8.1]
  # config/residents.yml の key と同じにする（ずれるとテストが落ちる）
  KEYS = %w[a b c].freeze

  def change
    create_table :residents do |t|
      t.references :playthrough, null: false, foreign_key: true
      t.string :key, null: false
      t.string :location_key
      t.jsonb :current_plan
      t.integer :plan_time_index
      t.jsonb :goal_progress, null: false, default: {}
      t.timestamps

      t.index %i[playthrough_id key], unique: true
      t.check_constraint "key IN (#{KEYS.map { "'#{_1}'" }.join(', ')})", name: "residents_key_in_catalog"
    end
  end
end
