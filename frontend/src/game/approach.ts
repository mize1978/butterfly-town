// 住民に話しかけるときの立ち位置（体験見本）。重なっていなければその場で話す。
// 近すぎて絵が重なるときだけ、住民の横の少し離れた「歩ける・まっすぐ行ける」位置を選び、そこまで歩いてから話す
import { allowed, DEAD_ZONE, moveAlong, type Point, type Town } from "../core/world";

// 絵が重なって見える近さ（論理座標）。人物の絵の幅は約50なので、横に60未満・前後に45未満なら重なる
const OVERLAP_X = 60;
const OVERLAP_Y = 45;
// 離れるときの住民との横の間隔。goTo は止まる線（DEAD_ZONE）の手前で止まるので、その分を見込んでも OVERLAP_X より広い
export const TALK_GAP = 80;

export const overlaps = (me: Point, other: Point) => Math.abs(me.x - other.x) < OVERLAP_X && Math.abs(me.y - other.y) < OVERLAP_Y;

export function talkSpot(town: Town, me: Point, other: Point): Point | null {
  if (!overlaps(me, other)) return null;
  const side = me.x >= other.x ? 1 : -1; // いま立っている側を先に試す
  const candidates: Point[] = [];
  for (const s of [side, -side]) for (const dy of [0, 20, -20]) candidates.push({ x: other.x + s * TALK_GAP, y: other.y + dy });
  for (const p of candidates) {
    if (!allowed(town, p.x, p.y)) continue;
    const d = Math.hypot(p.x - me.x, p.y - me.y);
    if (d < 1) return p;
    const end = moveAlong(town, me, (p.x - me.x) / d, (p.y - me.y) / d, d);
    if (Math.hypot(p.x - end.x, p.y - end.y) <= DEAD_ZONE) return p;
  }
  return null; // 離れられる場所が無い（そのまま話す）
}
