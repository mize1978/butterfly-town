# 特殊介入「うわさを流す」（#33）で得た記憶の出どころ rumor を足す
class AddRumorToMemoriesSource < ActiveRecord::Migration[8.1]
  def up
    remove_check_constraint :memories, name: "memories_source"
    add_check_constraint :memories, "source IN ('witnessed', 'told', 'initial', 'rumor')", name: "memories_source"
  end

  def down
    remove_check_constraint :memories, name: "memories_source"
    add_check_constraint :memories, "source IN ('witnessed', 'told', 'initial')", name: "memories_source"
  end
end
