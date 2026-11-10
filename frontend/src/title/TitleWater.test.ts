import { afterEach, describe, expect, it, vi } from "vitest";
import { initialWaterOn, saveWaterOn } from "./TitleWater";

// ブラウザの「視差効果を減らす」設定と、保存した選択を差し替えて確かめる
function env({ reduce, saved, broken = false }: { reduce: boolean; saved?: string; broken?: boolean }) {
  const store = new Map<string, string>(saved ? [["butterfly-town.title-water", saved]] : []);
  vi.stubGlobal("window", { matchMedia: (q: string) => ({ matches: q.includes("prefers-reduced-motion") && reduce }) });
  vi.stubGlobal("localStorage", broken
    ? { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } }
    : { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
  return store;
}

afterEach(() => vi.unstubAllGlobals());

describe("タイトルの水の動きの初期値", () => {
  it("保存した選択がない初回は、「視差効果を減らす」設定なら動かさない", () => {
    env({ reduce: true });
    expect(initialWaterOn()).toBe(false);
  });

  it("設定がなければ、初回から動かす", () => {
    env({ reduce: false });
    expect(initialWaterOn()).toBe(true);
  });

  it("本人が選んだオン・オフは、設定より優先して次回も使う", () => {
    const store = env({ reduce: true });
    saveWaterOn(true);
    expect(store.get("butterfly-town.title-water")).toBe("on");
    expect(initialWaterOn()).toBe(true);
    env({ reduce: false, saved: "off" });
    expect(initialWaterOn()).toBe(false);
  });

  it("保存できない環境でも止まらず、設定どおりの初期値になる", () => {
    env({ reduce: true, broken: true });
    expect(() => saveWaterOn(true)).not.toThrow();
    expect(initialWaterOn()).toBe(false);
  });
});
