# ゲストも、同じミッションの進行中の街は1つだけ（ユーザーと同じ決まり）。
# 再読み込みや二度押しで「開始」が同時に届いても、街が2つできないようにする
class AddOneInProgressPerGuest < ActiveRecord::Migration[8.1]
  def change
    add_index :playthroughs, %i[guest_id mission_key], unique: true, where: "status = 'in_progress'",
              name: "index_playthroughs_one_in_progress_per_guest"
  end
end
