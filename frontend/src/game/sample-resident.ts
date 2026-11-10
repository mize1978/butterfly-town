// 会話UIの試作用に、街へ1人だけ置く仮の住民と、固定のサンプル会話。
// AIには接続していない。住民の判断・記憶・保存は行わず、何度話しかけても同じ文を順に出すだけ
import type { Point } from "../core/world";

export type SampleLine = { speaker: "resident" | "note"; text: string };
export type SampleResident = { id: string; name: string; pos: Point; lines: readonly SampleLine[] };

// 話しかけられる距離（足元どうし・論理座標）。人物の高さ 195 の6割ほど
export const TALK_RANGE = 120;

// 住民を選ぶタップの当たり範囲（論理座標）。体は足元からの箱（立ち絵の頭頂 195 に少し余裕を足す）。
// 名札は文字の大きさ・名前の長さで幅が変わる（スマホとPCでも違う）ので、描いている名札の範囲（tag）をそのまま使い、
// 指で押しやすいよう周りを TAG_PAD だけ広げる
export type Rect = { x: number; y: number; w: number; h: number };
export const RESIDENT_HIT = { halfW: 40, top: 210, bottom: 16 } as const;
export const TAG_PAD = 6;
export function hitsResident(r: SampleResident, p: Point, tag?: Rect): boolean {
  const body = Math.abs(p.x - r.pos.x) <= RESIDENT_HIT.halfW && p.y >= r.pos.y - RESIDENT_HIT.top && p.y <= r.pos.y + RESIDENT_HIT.bottom;
  const onTag = !!tag && p.x >= tag.x - TAG_PAD && p.x <= tag.x + tag.w + TAG_PAD && p.y >= tag.y - TAG_PAD && p.y <= tag.y + tag.h + TAG_PAD;
  return body || onTag;
}

export const SAMPLE_RESIDENT: SampleResident = {
  id: "sample-a",
  name: "住民A（仮）",
  pos: { x: 1130, y: 470 }, // 祭りの通り（festival-street）の歩ける範囲の中。出現位置から右上へ少し歩いたところ
  lines: [
    { speaker: "resident", text: "こんにちは。祭りの準備で、通りが少しにぎやかになってきましたね。" },
    { speaker: "resident", text: "広場の飾りつけは、まだ人手が足りないみたいです。" },
    { speaker: "note", text: "サンプル会話はここまでです。" }
  ]
};
