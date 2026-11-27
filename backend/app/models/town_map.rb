# 街の地図の定義（config/towns/*.json）。DBには保存しない固定のデータ。
# 保存が必要なもの（進行・衣装・セーブなど）は ER 図で設計してから扱う。
#
# 項目：
# - size        街の論理座標の大きさ（左上が原点、y は下向き）
# - background  背景画像のキー（フロントエンドの public/art/<background>.png）
# - walkable    歩ける石畳の範囲（多角形）。建物・水路・柵はこの外側にあるため通れない
# - foreground  人物の手前に重なる植栽（多角形）。背景のこの範囲を人物の上に描き直して前後関係をつくる（仮の切り抜き）
# - spawn       街に出たときの足元の位置
# - places      住民の場所（config/residents.yml の locations）のうち、街の絵の上にあるもの。名前と、住民の人数分の立ち位置（#31）。
#               立ち位置は描く位置だけで、住民がどこにいるかは Rails（playthrough の residents.location_key）が決める
# - offstage    住民の場所のうち、街の絵の外にあるもの（家）と、その呼び方。画面はこの住民を描かず、情報欄に出す
# 値は描画試作（render-spike の core/world.ts）と同じ。フロントエンドの単体テストもこのファイルを読む。
class TownMap
  DIR = Rails.root.join("config/towns")

  def self.current
    @current ||= JSON.parse(DIR.join("festival-street.json").read).freeze
  end
end
