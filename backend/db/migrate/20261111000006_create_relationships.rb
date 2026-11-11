# 住民どうし・住民とプレイヤーの関係。from_key / toward_key は住民キー または player。
# ER 図の to_key は Active Record のメソッド名（to_key）とぶつかるため toward_key にした
class CreateRelationships < ActiveRecord::Migration[8.1]
  def change
    create_table :relationships do |t|
      t.references :playthrough, null: false, foreign_key: true
      t.string :from_key, null: false
      t.string :toward_key, null: false
      t.integer :affinity, null: false, default: 0
      t.string :note
      t.timestamps

      t.index %i[playthrough_id from_key toward_key], unique: true, name: "index_relationships_on_pair"
      t.check_constraint "from_key <> toward_key", name: "relationships_not_self"
    end
  end
end
