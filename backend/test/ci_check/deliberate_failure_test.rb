require "test_helper"

# Issue #21 の確認用。CI が失敗した PR をマージできないことを確かめるため、わざと落とす。
# この PR はマージしない
class DeliberateFailureTest < ActiveSupport::TestCase
  test "わざと失敗させる（#21 の確認用）" do
    assert false, "Issue #21 の確認用に、わざと失敗させている"
  end
end
