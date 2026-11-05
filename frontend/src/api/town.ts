// Rails API から街の地図を受け取る。形が想定と違えば、描画を始める前に失敗として扱う
import { inside, type Poly, type Town } from "../core/world";

export class TownLoadError extends Error {}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function polygon(v: unknown, name: string): Poly {
  if (!Array.isArray(v) || v.length < 3 || !v.every((p) => Array.isArray(p) && p.length === 2 && isNum(p[0]) && isNum(p[1]))) {
    throw new TownLoadError(`街の地図の ${name} が3点以上の座標の並びになっていません`);
  }
  return v as unknown as Poly;
}

export function parseTown(body: unknown): Town {
  if (!isObj(body)) throw new TownLoadError("街の地図が JSON のオブジェクトではありません");
  const { id, name, size, background, walkable, foreground, spawn } = body;
  if (typeof id !== "string" || typeof name !== "string" || typeof background !== "string") throw new TownLoadError("街の地図の id・name・background が文字列ではありません");
  if (!isObj(size) || !isNum(size.width) || !isNum(size.height) || size.width <= 0 || size.height <= 0) throw new TownLoadError("街の地図の size が正しくありません");
  if (!isObj(spawn) || !isNum(spawn.x) || !isNum(spawn.y)) throw new TownLoadError("街の地図の spawn が正しくありません");
  const town: Town = {
    id, name, background,
    size: { width: size.width, height: size.height },
    walkable: polygon(walkable, "walkable"),
    foreground: polygon(foreground, "foreground"),
    spawn: { x: spawn.x, y: spawn.y }
  };
  if (!inside(town.spawn.x, town.spawn.y, town.walkable)) throw new TownLoadError("街の地図の spawn が歩ける範囲の外にあります");
  return town;
}

export async function fetchTown(signal?: AbortSignal): Promise<Town> {
  let res: Response;
  try {
    res = await fetch("/api/v1/town", { headers: { Accept: "application/json" }, signal });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new TownLoadError("サーバーに接続できませんでした");
  }
  if (!res.ok) throw new TownLoadError(`街の地図を取得できませんでした（HTTP ${res.status}）`);
  let body: unknown;
  try { body = await res.json(); } catch { throw new TownLoadError("街の地図が JSON ではありません"); }
  return parseTown(body);
}
