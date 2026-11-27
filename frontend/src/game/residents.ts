// 街の3人の住民（#31）。どこにいるかは Rails が確定した location_key をそのまま使い、画面は日課や移動の予定を持たない。
// 画面が決めるのは「その場所のどの立ち位置に描くか」と「街の絵にいない住民をどう書くか」だけ。
// 住民の名前はまだ決まっていない（residents.yml の key a・b・c が仮）ので、「住民a」のように書く
import type { ResidentState } from "../api/playthrough";
import type { Point, Town } from "../core/world";

export type PlacedResident = { key: string; name: string; pos: Point }; // 街の絵の上に描く住民
export type AwayResident = { key: string; name: string; where: string }; // 街の絵にいない住民（家・場所不明）

export const residentName = (key: string) => `住民${key}`;
export const UNKNOWN_PLACE = "場所不明";
const byKey = (a: ResidentState, b: ResidentState) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

// 同じ場所の住民は、住民キーの順に立ち位置を前から割り当てる（API の並び順が変わっても入れ替わらない）。
// 家（offstage）にいる住民は描かず、その呼び方で返す。地図に無い場所のキーは推測で描かず「場所不明」にする
export function placeResidents(town: Town, residents: readonly ResidentState[]): { onMap: PlacedResident[]; away: AwayResident[] } {
  const onMap: PlacedResident[] = [], away: AwayResident[] = [];
  const used = new Map<string, number>();
  for (const r of [...residents].sort(byKey)) {
    const name = residentName(r.key), loc = r.locationKey;
    const place = Object.hasOwn(town.places, loc) ? town.places[loc] : null;
    if (place) {
      const i = used.get(loc) ?? 0;
      used.set(loc, i + 1);
      const stand = place.stands[i];
      // 立ち位置が足りない（住民が増えたのに地図を直していない）ときは重ねて描かず、場所の名前だけ出す
      if (stand) onMap.push({ key: r.key, name, pos: { ...stand } });
      else away.push({ key: r.key, name, where: place.name });
    } else {
      away.push({ key: r.key, name, where: Object.hasOwn(town.offstage, loc) ? town.offstage[loc] : UNKNOWN_PLACE });
    }
  }
  return { onMap, away };
}

export const awayLine = (r: AwayResident) => `${r.name}：${r.where}`;

// 住民との会話の見出し。話題を選ぶ会話（#32）ができるまでは、どの住民でも同じサンプル会話を出す
export const talkTitle = (name: string) => `${name}との会話（サンプル・AI未接続）`;
