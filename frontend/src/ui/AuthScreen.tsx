// S02 登録・S03 ログイン（#16）。メールアドレスとパスワードだけの入力画面。
// 失敗したときは、入力をそのまま残して理由を欄の下に出す（入力画面に戻ったまま直せる）。
// 登録・ログインしても、いまの試作版では街は保存されない（保存・引継ぎは #40・#41）ので、そのことを画面に書く
import { useId, useRef, useState, type FormEvent, type ReactElement } from "react";
import { AuthError, fieldMessages, login, register, type User } from "../api/auth";
import { Frame } from "./Frame";

export type AuthMode = "register" | "login";

export function AuthScreen({ mode, onDone, onSwitch, onBack }: {
  mode: AuthMode;
  onDone: (user: User) => void;
  onSwitch: (mode: AuthMode) => void;
  onBack: () => void;
}) {
  const isRegister = mode === "register";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [sending, setSending] = useState(false);
  const formError = useRef<HTMLParagraphElement>(null);
  const id = useId();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    setErrors({});
    try {
      const result = isRegister
        ? await register({ email, password, passwordConfirmation: confirmation })
        : await login({ email, password });
      if (result.ok) { onDone(result.user); return; }
      setErrors("errors" in result ? fieldMessages(result.errors) : { form: ["メールアドレスかパスワードが違います"] });
    } catch (err) {
      setErrors({ form: [err instanceof AuthError ? err.message : "うまくいきませんでした。もう一度お試しください"] });
    } finally {
      setSending(false);
    }
    // 失敗の理由を読み上げ・目で追えるよう、最初の問題の欄（無ければ全体の理由）へフォーカスを移す
    requestAnimationFrame(() => {
      const bad = document.querySelector<HTMLElement>(".auth-form [aria-invalid='true']");
      (bad ?? formError.current)?.focus();
    });
  };

  const field = (key: string, label: string, input: ReactElement, hint?: string) => {
    const msgs = errors[key] ?? [];
    return (
      <div className="auth-field">
        <label htmlFor={`${id}-${key}`}>{label}</label>
        {input}
        {hint && <p className="auth-hint" id={`${id}-${key}-hint`}>{hint}</p>}
        {msgs.length > 0 && <div className="auth-error" id={`${id}-${key}-error`}>{msgs.map((m) => <p key={m}>{m}</p>)}</div>}
      </div>
    );
  };
  const describe = (key: string, hint = false) =>
    [hint ? `${id}-${key}-hint` : "", errors[key]?.length ? `${id}-${key}-error` : ""].filter(Boolean).join(" ") || undefined;

  return (
    <Frame label={isRegister ? "登録" : "ログイン"}>
      <main className="page auth-page">
        <h1 className="lead-s">{isRegister ? "メールアドレスで登録" : "ログイン"}</h1>
        <form className="auth-form" onSubmit={submit} noValidate>
          {field("email", "メールアドレス",
            <input id={`${id}-email`} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false}
              value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errors.email?.length} aria-describedby={describe("email")} autoFocus />)}
          {field("password", "パスワード",
            <input id={`${id}-password`} type="password" autoComplete={isRegister ? "new-password" : "current-password"}
              value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!errors.password?.length}
              aria-describedby={describe("password", isRegister)} />,
            isRegister ? "8文字以上" : undefined)}
          {isRegister && field("passwordConfirmation", "パスワード（確認用）",
            <input id={`${id}-passwordConfirmation`} type="password" autoComplete="new-password"
              value={confirmation} onChange={(e) => setConfirmation(e.target.value)} aria-invalid={!!errors.passwordConfirmation?.length}
              aria-describedby={describe("passwordConfirmation")} />)}
          {errors.form && <p className="auth-error form" role="alert" tabIndex={-1} ref={formError}>{errors.form.join(" ")}</p>}
          <button type="submit" className="btn primary" disabled={sending}>
            {sending ? "送信しています…" : isRegister ? "登録する" : "ログインする"}
          </button>
        </form>
        <p className="note">試作版のため、登録・ログインしても街の進み具合はまだ保存されません（保存は準備中です）。</p>
        <div className="actions">
          <button type="button" className="btn" onClick={() => onSwitch(isRegister ? "login" : "register")}>
            {isRegister ? "登録済みの方はログイン" : "はじめての方は登録"}
          </button>
          <button type="button" className="btn ghost" onClick={onBack}>トップへ戻る</button>
        </div>
      </main>
    </Frame>
  );
}
