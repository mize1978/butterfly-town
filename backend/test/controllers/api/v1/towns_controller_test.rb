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

  # #31：住民の場所（config/residents.yml の locations）は、街の絵の上の場所（places）か、絵の外の場所（offstage）の
  # どちらか一方に必ずある。画面は location_key をこの表で引くだけで、知らない場所を推測で描かない
  test "住民の場所は、街の絵の上（places）か絵の外（offstage）のどちらか一方にだけある" do
    get "/api/v1/town"

    body = response.parsed_body
    places, offstage = body.fetch("places"), body.fetch("offstage")
    assert_equal [], places.keys & offstage.keys
    assert_equal ResidentCatalog.locations.sort, (places.keys + offstage.keys).sort
    assert_equal({ "home_a" => "家", "home_b" => "家", "home_c" => "家" }, offstage)
  end

  test "絵の上の場所には、名前と、歩ける範囲の中にある住民3人分の立ち位置がある" do
    get "/api/v1/town"

    body = response.parsed_body
    assert_equal({ "plaza" => "広場", "shop" => "店" }, body.fetch("places").transform_values { _1["name"] })
    body.fetch("places").each do |key, place|
      stands = place.fetch("stands")
      assert_equal ResidentCatalog.keys.size, stands.size, key
      stands.each { assert point_inside?(_1.values_at("x", "y"), body["walkable"]), "#{key}: #{_1}" }
    end
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
