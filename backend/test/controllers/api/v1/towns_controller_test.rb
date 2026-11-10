require "test_helper"

class Api::V1::TownsControllerTest < ActionDispatch::IntegrationTest
  test "街の地図の定義を JSON で返す" do
    get "/api/v1/town"

    assert_response :success
    assert_equal "application/json", response.media_type
    body = response.parsed_body
    assert_equal "festival-street", body["id"]
    assert_equal({ "width" => 1536, "height" => 1024 }, body["size"])
    assert_equal "town", body["background"]
    assert_equal({ "x" => 930, "y" => 625 }, body["spawn"])
  end

  test "歩ける範囲と植栽は、街の中に収まる3点以上の多角形" do
    get "/api/v1/town"

    body = response.parsed_body
    width, height = body["size"].values_at("width", "height")
    %w[walkable foreground].each do |key|
      polygon = body[key]
      assert_operator polygon.size, :>=, 3, key
      polygon.each do |x, y|
        assert x.between?(0, width), "#{key}: x=#{x}"
        assert y.between?(0, height), "#{key}: y=#{y}"
      end
    end
  end

  test "出現位置は歩ける範囲の中にある" do
    get "/api/v1/town"

    body = response.parsed_body
    assert point_inside?(body["spawn"].values_at("x", "y"), body["walkable"])
  end

  private

  # 偶奇判定（フロントエンドの core/world.ts の inside と同じ規則）
  def point_inside?((x, y), polygon)
    inside = false
    polygon.each_with_index do |a, i|
      b = polygon[i - 1]
      if (a[1] > y) != (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]).fdiv(b[1] - a[1]) + a[0]
        inside = !inside
      end
    end
    inside
  end
end
