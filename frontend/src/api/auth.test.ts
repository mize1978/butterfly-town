import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthError, fetchCurrentUser, fieldMessages, login, logout, register } from "./auth";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const USER = { user: { email: "one@example.com" } };

afterEach(() => { vi.unstubAllGlobals(); });

describe("ログイン中のユーザー（fetchCurrentUser）", () => {
  it("GET /api/v1/session を Cookie つきで呼び、ログイン中ならメールアドレス、していなければ null を返す", async () => {
    const f = vi.fn(async () => json(USER));
    vi.stubGlobal("fetch", f);
    await expect(fetchCurrentUser()).resolves.toEqual({ email: "one@example.com" });
    expect(f).toHaveBeenCalledWith("/api/v1/session", expect.objectContaining({ method: "GET", credentials: "same-origin" }));

    vi.stubGlobal("fetch", vi.fn(async () => json({ user: null })));
    await expect(fetchCurrentUser()).resolves.toBeNull();
  });

  it("形の違う返事・接続の失敗は失敗にする（ログインしていないと取り違えない）", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ user: { email: 1 } })));
    await expect(fetchCurrentUser()).rejects.toThrow(AuthError);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    await expect(fetchCurrentUser()).rejects.toThrow("サーバーに接続できませんでした");
  });
});

describe("登録（register）", () => {
  it("POST /api/v1/registration に JSON で送り、登録したユーザーを返す", async () => {
    const f = vi.fn(async () => json({ user: { email: "new@example.com" } }, 201));
    vi.stubGlobal("fetch", f);
    await expect(register({ email: "new@example.com", password: "password123", passwordConfirmation: "password123" }))
      .resolves.toEqual({ ok: true, user: { email: "new@example.com" } });
    expect(f).toHaveBeenCalledWith("/api/v1/registration", expect.objectContaining({
      method: "POST", credentials: "same-origin", headers: expect.objectContaining({ "Content-Type": "application/json" }),
      body: JSON.stringify({ email: "new@example.com", password: "password123", password_confirmation: "password123" })
    }));
  });

  it("登録できた（201）のに返事にユーザーが無いときは、成功にせず失敗にする", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ user: null }, 201)));
    await expect(register({ email: "new@example.com", password: "password123", passwordConfirmation: "password123" })).rejects.toThrow(AuthError);
  });

  it("入力の問題（422）は、項目ごとの理由として返す", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ errors: { email: ["taken"], password: ["too_short"] } }, 422)));
    await expect(register({ email: "one@example.com", password: "short", passwordConfirmation: "short" }))
      .resolves.toEqual({ ok: false, errors: { email: ["taken"], password: ["too_short"] } });
  });

  it("試しすぎ（429）・サーバーの失敗は失敗にする", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "rate_limited" }, 429)));
    await expect(register({ email: "a@example.com", password: "password123", passwordConfirmation: "password123" }))
      .rejects.toThrow("しばらく待ってから");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })));
    await expect(register({ email: "a@example.com", password: "password123", passwordConfirmation: "password123" }))
      .rejects.toThrow("HTTP 500");
  });
});

describe("ログイン（login）・ログアウト（logout）", () => {
  it("正しければユーザーを返し、違えば（401）理由を返す", async () => {
    const f = vi.fn(async () => json(USER));
    vi.stubGlobal("fetch", f);
    await expect(login({ email: "one@example.com", password: "password123" })).resolves.toEqual({ ok: true, user: { email: "one@example.com" } });
    expect(f).toHaveBeenCalledWith("/api/v1/session", expect.objectContaining({ method: "POST" }));

    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "invalid_credentials" }, 401)));
    await expect(login({ email: "one@example.com", password: "wrong" })).resolves.toEqual({ ok: false, error: "invalid_credentials" });
  });

  it("ログアウトは DELETE /api/v1/session。204 なら成功", async () => {
    const f = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", f);
    await expect(logout()).resolves.toBeUndefined();
    expect(f).toHaveBeenCalledWith("/api/v1/session", expect.objectContaining({ method: "DELETE" }));
    // Rails は JSON で送られた要求だけを受け付ける（他サイトのフォームからの要求を拒否するため）
    expect((f.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toMatchObject({ "Content-Type": "application/json" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })));
    await expect(logout()).rejects.toThrow(AuthError);
  });
});

describe("入力の理由を画面の文にする（fieldMessages）", () => {
  it("知っている理由は日本語の文に、知らない理由も入力の問題として伝える", () => {
    expect(fieldMessages({ email: ["taken"], password: ["too_short"], password_confirmation: ["confirmation"] })).toEqual({
      email: ["このメールアドレスはすでに登録されています"],
      password: ["パスワードは8文字以上にしてください"],
      passwordConfirmation: ["確認用のパスワードが一致しません"]
    });
    expect(fieldMessages({ email: ["blank", "invalid"], password: ["blank", "password_too_long"] })).toEqual({
      email: ["メールアドレスを入力してください", "メールアドレスの形式が正しくありません"],
      password: ["パスワードを入力してください", "パスワードが長すぎます（72バイトまで）"]
    });
    expect(fieldMessages({ email: ["something_new"] })).toEqual({ email: ["メールアドレスを確かめてください"] });
  });
});
