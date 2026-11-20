# users ができたので、先に列だけ作っておいた user_id に外部キーを足す（#16。ER 図「AIの予算」と playthroughs の注記）
class AddUserForeignKeys < ActiveRecord::Migration[8.1]
  def change
    add_foreign_key :playthroughs, :users
    add_foreign_key :ai_calls, :users
  end
end
