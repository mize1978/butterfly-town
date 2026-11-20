require "test_helper"

# #16 ユーザーのモデル。メールアドレスは前後の空白を除いて小文字にそろえ、形式と一意を確かめる。
# パスワードは 8 文字以上（bcrypt の上限の 72 バイトまで）。確認用を送ったときは一致を確かめる
class UserTest < ActiveSupport::TestCase
  def build(**attrs) = User.new({ email: "new@example.com", password: "password123" }.merge(attrs))
  def codes(user, attr) = user.tap(&:validate).errors.details[attr].map { _1[:error] }

  test "正しい入力なら保存でき、パスワードはそのまま残さない（ハッシュだけ）" do
    user = build
    assert user.save
    refute_equal "password123", user.password_digest
    assert user.authenticate("password123")
    refute user.authenticate("wrong-password")
  end

  test "メールアドレスは前後の空白を除いて小文字にそろえる" do
    assert_equal "downcased@example.com", build(email: " DOWNCASED@EXAMPLE.COM ").email
  end

  test "メールアドレスは必須で、形式が正しいこと" do
    assert_includes codes(build(email: ""), :email), :blank
    [ "plainaddress", "a@", "@example.com", "a b@example.com" ].each do |bad|
      assert_includes codes(build(email: bad), :email), :invalid, bad
    end
    assert_empty codes(build(email: "first.last+tag@sub.example.jp"), :email)
  end

  test "同じメールアドレス（大文字・小文字の違いを含む）は登録できない。DB の一意制約でも防ぐ" do
    assert_includes codes(build(email: "ONE@example.com"), :email), :taken
    assert_raises(ActiveRecord::RecordNotUnique) do
      User.insert!({ email: "one@example.com", password_digest: "x", created_at: Time.current, updated_at: Time.current })
    end
  end

  test "パスワードは必須で、8 文字以上・72 バイトまで" do
    assert_includes codes(User.new(email: "new@example.com"), :password), :blank
    assert_includes codes(build(password: "short12"), :password), :too_short
    assert_empty codes(build(password: "12345678"), :password)
    assert_includes codes(build(password: "a" * 73), :password), :password_too_long
  end

  test "確認用のパスワードを送ったときは、一致しないと登録できない" do
    assert_includes codes(build(password_confirmation: "different1"), :password_confirmation), :confirmation
    assert_empty codes(build(password_confirmation: "password123"), :password_confirmation)
  end

  test "ユーザーを消すと、ログイン中のセッションも消える" do
    user = users(:one)
    user.sessions.create!
    assert_difference -> { Session.count }, -1 do
      user.destroy
    end
  end
end
