// 登録・ログイン・ログアウト（#16）。Rails が Cookie（署名つきの session_id）でログイン中の端末を見分ける。
// ゲストの街（guest_token）とは別の Cookie なので、ログイン・ログアウトしてもゲストの街はそのまま残る。
// 入力の問題は Rails が項目ごとの理由（blank・taken など）で返し、文言はここで決める
export class AuthError extends Error {}

export type User = { email: string };
export type FieldErrors = Record<string, string[]>;
export type RegisterResult = { ok: true; user: User } | { ok: false; errors: FieldErrors };
export type LoginResult = { ok: true; user: User } | { ok: false; error: "invalid_credentials" };

const SESSION = "/api/v1/session";
const REGISTRATION = "/api/v1/registration";
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

async function request(url: string, method: string, body?: unknown): Promise<Response> {
  try {
    return await fetch(url, {
      method, credentials: "same-origin",
      headers: body === undefined ? { Accept: "application/json" } : { Accept: "application/json", "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    throw new AuthError("サーバーに接続できませんでした");
  }
}

async function readJson(res: Response): Promise<unknown> {
  try { return await res.json(); } catch { throw new AuthError("サーバーの返事が JSON ではありません"); }
}

function parseUser(body: unknown): User | null {
  if (!isObj(body) || !("user" in body)) throw new AuthError("ログインの状態の形が正しくありません");
  const { user } = body;
  if (user === null) return null;
  if (!isObj(user) || typeof user.email !== "string") throw new AuthError("ログインの状態の形が正しくありません");
  return { email: user.email };
}

function fail(res: Response, what: string): never {
  if (res.status === 429) throw new AuthError("何度も続けて試したため、受け付けを止めています。しばらく待ってから、もう一度お試しください");
  throw new AuthError(`${what}できませんでした（HTTP ${res.status}）`);
}

// 開いたとき：ログイン中ならそのユーザー、していなければ null
export async function fetchCurrentUser(): Promise<User | null> {
  const res = await request(SESSION, "GET");
  if (res.status !== 200) fail(res, "ログインの状態を確認");
  return parseUser(await readJson(res));
}

export async function register(input: { email: string; password: string; passwordConfirmation: string }): Promise<RegisterResult> {
  const res = await request(REGISTRATION, "POST", { email: input.email, password: input.password, password_confirmation: input.passwordConfirmation });
  if (res.status === 201) return { ok: true, user: parseUser(await readJson(res))! };
  if (res.status === 422) {
    const body = await readJson(res);
    const errors = isObj(body) && isObj(body.errors) ? body.errors : null;
    if (!errors || !Object.values(errors).every((v) => Array.isArray(v) && v.every((s) => typeof s === "string"))) {
      throw new AuthError("登録の失敗の理由を読み取れませんでした");
    }
    return { ok: false, errors: errors as FieldErrors };
  }
  fail(res, "登録");
}

export async function login(input: { email: string; password: string }): Promise<LoginResult> {
  const res = await request(SESSION, "POST", { email: input.email, password: input.password });
  if (res.status === 200) {
    const user = parseUser(await readJson(res));
    if (!user) throw new AuthError("ログインの状態の形が正しくありません");
    return { ok: true, user };
  }
  if (res.status === 401) return { ok: false, error: "invalid_credentials" };
  fail(res, "ログイン");
}

export async function logout(): Promise<void> {
  const res = await request(SESSION, "DELETE");
  if (res.status !== 204) fail(res, "ログアウト");
}

// 項目ごとの理由を、画面に出す文にする（項目名は画面の入力欄の名前にそろえる）
const FIELD: Record<string, { key: string; label: string; messages: Record<string, string> }> = {
  email: {
    key: "email", label: "メールアドレス",
    messages: { blank: "メールアドレスを入力してください", invalid: "メールアドレスの形式が正しくありません", taken: "このメールアドレスはすでに登録されています" }
  },
  password: {
    key: "password", label: "パスワード",
    messages: { blank: "パスワードを入力してください", too_short: "パスワードは8文字以上にしてください", password_too_long: "パスワードが長すぎます（72バイトまで）" }
  },
  password_confirmation: { key: "passwordConfirmation", label: "確認用のパスワード", messages: { confirmation: "確認用のパスワードが一致しません" } }
};

export function fieldMessages(errors: FieldErrors): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [field, codes] of Object.entries(errors)) {
    const f = FIELD[field];
    const key = f?.key ?? "form";
    out[key] = [...(out[key] ?? []), ...codes.map((c) => f?.messages[c] ?? `${f?.label ?? "入力"}を確かめてください`)];
  }
  return out;
}
