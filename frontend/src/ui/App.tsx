// 画面の切り替え。Figma「02_提出用・詳細画面と遷移」の S01 トップ → S04 着せ替え → S05 街・徒歩 と、S01 → S25 遊び方 の導線。
// 認証（S02・S03）・保存（S14・S15）・つづきからはまだ作っていないので、押せないボタンと理由だけを示す
import { useState } from "react";
import { DressScreen } from "./DressScreen";
import { HowToScreen } from "./HowToScreen";
import { TitleScreen } from "./TitleScreen";
import { TownScreen } from "./TownScreen";

export type Screen = "title" | "howto" | "dress" | "town";

export function App() {
  const [screen, setScreen] = useState<Screen>("title");

  switch (screen) {
    case "title": return <TitleScreen onGuest={() => setScreen("dress")} onHowTo={() => setScreen("howto")} />;
    case "howto": return <HowToScreen onStart={() => setScreen("dress")} onBack={() => setScreen("title")} />;
    case "dress": return <DressScreen onEnter={() => setScreen("town")} onBack={() => setScreen("title")} />;
    case "town": return <TownScreen onExitToTitle={() => setScreen("title")} />;
  }
}
