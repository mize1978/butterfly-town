# 登録ユーザー（#16）。Rails 8 の認証の雛形から作り、列名は ER 図（users.email）に合わせた。
# メールアドレスは小文字に正規化して一意。パスワードは bcrypt のハッシュだけを持つ
class CreateUsers < ActiveRecord::Migration[8.1]
  def change
    create_table :users do |t|
      t.string :email, null: false
      t.string :password_digest, null: false

      t.timestamps
    end
    add_index :users, :email, unique: true
  end
end
