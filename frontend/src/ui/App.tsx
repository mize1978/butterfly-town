// 画面の切り替え。Figma「02_提出用・詳細画面と遷移」の S01 トップ → S04 着せ替え → S05 街・徒歩 と、S01 → S25 遊び方 の導線。
// 街（playthrough）は Rails が Cookie でゲストを見分けて持つ（#7）。
//   開いたとき（再読み込みを含む）：GET で進行中の街を確かめ、あればその状態で街へ戻す。無ければトップ
//   「ゲストで遊ぶ」：POST で街を始める（同じブラウザに進行中の街があれば、作り直さずに続きが返る）
// 登録（S02）・ログイン（S03）・ログアウトは #16。ログインはゲストの街とは別の Cookie で、街の保存・引継ぎ（#40・#41）はまだ無い。
// 保存（S14・S15）はまだ作っていないので、押せないボタンと理由だけを示す
import { useCallback, useEffect, useState } from "react";
import { fetchCurrentUser, logout, type User } from "../api/auth";
import { fetchPlaythrough, startPlaythrough, type PlaythroughState } from "../api/playthrough";
import { AuthScreen } from "./AuthScreen";
import { DressScreen } from "./DressScreen";
import { Frame } from "./Frame";
import { HowToScreen } from "./HowToScreen";
import { TitleScreen } from "./TitleScreen";
import { TownScreen } from "./TownScreen";

export type Screen = "checking" | "title" | "howto" | "dress" | "town" | "register" | "login";

export function App() {
  const [screen, setScreen] = useState<Screen>("checking");
  const [playthrough, setPlaythrough] = useState<PlaythroughState | null>(null);
  const [notice, setNotice] = useState<string | null>(null); // トップに出す、通信の失敗などの案内
  const [starting, setStarting] = useState(false);
  const [user, setUser] = useState<User | null>(null); // ログイン中のユーザー（していなければ null）
  const [leaving, setLeaving] = useState(false); // ログアウトの通信の途中

  // 開いたとき：ログインしているかを確かめる（確かめられなくても、ゲストでは遊べるので案内だけ出す）
  useEffect(() => {
    let alive = true;
    fetchCurrentUser()
      .then((u) => { if (alive) setUser(u); })
      .catch((e: Error) => { if (alive) setNotice(`${e.message}。ログインの状態を確かめられませんでした。`); });
    return () => { alive = false; };
  }, []);

  const signedIn = useCallback((u: User) => {
    setUser(u);
    setNotice(null);
    setScreen("title");
  }, []);

  const signOut = useCallback(async () => {
    setLeaving(true);
    setNotice(null);
    try {
      await logout();
      setUser(null);
    } catch (e) {
      setNotice(`${(e as Error).message}。もう一度お試しください。`);
    } finally {
      setLeaving(false);
    }
  }, []);

  // 開いたとき：進行中の街があれば、その状態で街へ戻す
  useEffect(() => {
    let alive = true;
    fetchPlaythrough()
      .then((state) => {
        if (!alive) return;
        setPlaythrough(state);
        setScreen(state ? "town" : "title");
      })
      .catch((e: Error) => {
        if (!alive) return;
        setNotice(`${e.message}。「ゲストで遊ぶ」を押すと、もう一度つなぎます。`);
        setScreen("title");
      });
    return () => { alive = false; };
  }, []);

  const start = useCallback(async () => {
    setStarting(true);
    setNotice(null);
    try {
      const { state } = await startPlaythrough();
      setPlaythrough(state);
      setScreen("dress");
    } catch (e) {
      setNotice(`${(e as Error).message}。通信を確かめて、もう一度お試しください。`);
      setScreen("title");
    } finally {
      setStarting(false);
    }
  }, []);

  switch (screen) {
    case "checking":
      return <Frame label="読み込み中"><main className="page"><p className="status" role="status">街を確かめています…</p></main></Frame>;
    case "title": return <TitleScreen onGuest={start} onHowTo={() => setScreen("howto")} starting={starting} notice={notice}
      user={user} onRegister={() => setScreen("register")} onLogin={() => setScreen("login")} onLogout={signOut} leaving={leaving} />;
    case "register":
    case "login":
      return <AuthScreen key={screen} mode={screen} onDone={signedIn} onSwitch={setScreen} onBack={() => setScreen("title")} />;
    case "howto": return <HowToScreen onStart={start} onBack={() => setScreen("title")} starting={starting} />;
    case "dress": return <DressScreen onEnter={() => setScreen("town")} onBack={() => setScreen("title")} />;
    case "town": return <TownScreen playthrough={playthrough} onPlaythroughChange={setPlaythrough} onExitToTitle={() => setScreen("title")} />;
  }
}
