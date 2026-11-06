// スマホで街を映す大きさ。PC の 1100×660 を縮めて並べるのではなく、街の画面の枠（ヘッダーの下の残り）と同じ形で映す。
// 拡大率は「最低でもこの範囲は見える」大きさから決める。縦画面では横 440 が、横画面では縦 400 が基準になり、
// 人物（絵の上で高さ約150）と住民の名札が、縦画面では等倍ほどの大きさで見える。絵は縦横同じ倍率なので引き伸ばさない
import type { ViewSize } from "../core/camera";
import type { Town } from "../core/world";

export const PHONE_MIN_VIEW = { w: 440, h: 400 } as const;
// スマホとして扱う画面（CSS の街画面の切り替えと同じ条件）
export const PHONE_QUERY = "(max-width: 640px), (max-height: 480px)";

export function phoneViewSize(hostW: number, hostH: number, town: Town): ViewSize {
  if (hostW <= 0 || hostH <= 0) return { w: PHONE_MIN_VIEW.w, h: PHONE_MIN_VIEW.h };
  // 1画面の点あたり、街の絵を何点映すか。どちらの向きでも最低範囲を満たす大きい方を取る
  let k = Math.max(PHONE_MIN_VIEW.w / hostW, PHONE_MIN_VIEW.h / hostH);
  // 街より大きくは映せないので、はみ出す場合は形を保ったまま縮める
  k = Math.min(k, town.size.width / hostW, town.size.height / hostH);
  return { w: Math.round(hostW * k), h: Math.round(hostH * k) };
}
