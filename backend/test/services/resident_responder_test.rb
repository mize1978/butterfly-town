require "test_helper"

# #30 応答の作り手の差し替え口。RESIDENT_RESPONDER=llm のときだけ実LLM、それ以外（テスト・いまの公開版）は決まった応答
class ResidentResponderTest < ActiveSupport::TestCase
  def build(env) = ResidentResponder.build(env)

  test "指定が無ければ決まった応答（費用なし）" do
    assert_same FixedResponder.default, build({})
    assert_same FixedResponder.default, build("RESIDENT_RESPONDER" => "fixed", "ANTHROPIC_API_KEY" => "k")
  end

  test "llm を指定すると実LLM。API キーは環境変数から読む" do
    r = build("RESIDENT_RESPONDER" => "llm", "ANTHROPIC_API_KEY" => "test-key")
    assert_kind_of LlmResponder, r
    assert r.billable?
  end

  test "llm を指定したのに API キーが無ければ、決まった応答に黙って戻さず、起動時に失敗させる" do
    e = assert_raises(KeyError) { build("RESIDENT_RESPONDER" => "llm") }
    assert_includes e.message, "ANTHROPIC_API_KEY"
  end

  test "知らない指定も失敗させる" do
    assert_raises(ArgumentError) { build("RESIDENT_RESPONDER" => "gpt") }
  end

  test "テストでは決まった応答を使う" do
    assert_same FixedResponder.default, ResidentResponder.default
  end
end
