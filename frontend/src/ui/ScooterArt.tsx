// 作業台に描くスクーターと部品の絵（仮）。着せ替え×スクーター統合モック（~/outputs/butterfly-wardrobe-scooter-mock-v1/mock/scooter-art.js）の
// SVG をそのまま React に移したもの（外部の画像ファイルは使わない）。はめた部品だけを描き、まだの所は点線で示す
import type { PartId } from "../game/errand";

const MINT = "url(#scooter-mint)";

// pulse：いまはめた部品（はまった瞬間だけ弾ませる。触れる作業台の見本で使う）。ghosts：まだの所を点線で描くか（従来の作業台は描く）
export function ScooterDrawing({ placed, complete = false, pulse = null, ghosts = true }:
  { placed: readonly PartId[]; complete?: boolean; pulse?: PartId | null; ghosts?: boolean }) {
  const has = (p: PartId) => complete || placed.includes(p);
  const cls = (p: PartId) => (pulse === p ? "part-snap" : undefined);
  return (
    <svg viewBox="0 0 620 340" className="scooter-drawing" role="img" aria-label={`ミント色のレトロスクーター（取り付け済み：${placed.length}/4）`}>
      <defs>
        <linearGradient id="scooter-mint" x2="0.5" y2="1"><stop stopColor="#bce9dc" /><stop offset="1" stopColor="#68b8ab" /></linearGradient>
      </defs>
      <ellipse cx="305" cy="288" rx="215" ry="18" fill="#3c685c" opacity=".12" />
      <g fill="none" stroke="#50636a" strokeWidth="9" strokeLinecap="round"><path d="M156 261 L290 261 L420 246 L457 139" /><path d="M433 108 L458 137 L469 253" /></g>
      <Wheel cx={466} />
      <path d="M420 222 Q463 185 509 222" fill="none" stroke="#7dcabb" strokeWidth="21" strokeLinecap="round" />
      <path d="M274 164 Q292 195 289 230 L395 230 Q413 193 409 151 L394 97 Q392 83 409 83 L439 83 L458 105 L442 134 L440 176 Q437 224 411 250 L279 250 L261 206Z" fill={MINT} stroke="#507d75" strokeWidth="3" />
      <path d="M399 103 L427 103" stroke="#f0f6dc" strokeWidth="6" strokeLinecap="round" />
      <path d="M410 85 L426 55 L456 54" fill="none" stroke="#60777b" strokeWidth="8" strokeLinecap="round" />
      <rect x="431" y="47" width="37" height="12" rx="6" fill="#46545c" />
      <path d="M420 60 L412 24" fill="none" stroke="#60777b" strokeWidth="4" /><ellipse cx="407" cy="21" rx="19" ry="12" fill="#d7edf0" stroke="#60777b" strokeWidth="4" />
      <ellipse cx="443" cy="99" rx="21" ry="22" fill="#fff2bf" stroke="#e2b96b" strokeWidth="5" />
      <path d="M107 212 Q112 171 158 165 L269 165 Q290 177 279 222 L260 247 L117 247Z" fill="#9eb3ad" opacity=".35" stroke="#507d75" strokeWidth="3" strokeDasharray="6 5" />
      <rect x="135" y="142" width="146" height="27" rx="13" fill="#805e54" stroke="#624d48" strokeWidth="3" /><path d="M145 150 H268" stroke="#be9b85" strokeWidth="3" />
      {has("wheel") ? <g className={cls("wheel")}><Wheel cx={160} /></g> : ghosts && <circle cx="160" cy="260" r="43" fill="#fffaf1" fillOpacity=".3" stroke="#7e9f96" strokeWidth="3" strokeDasharray="7 6" />}
      {has("belt") && (
        <g className={cls("belt")}><rect x="170" y="223" width="144" height="34" rx="17" fill="none" stroke="#52616b" strokeWidth="9" /><circle cx="193" cy="240" r="9" fill="#e4ba6d" /><circle cx="291" cy="240" r="9" fill="#e4ba6d" /></g>
      )}
      {has("battery") && <g className={cls("battery")}><rect x="292" y="157" width="47" height="55" rx="7" fill="#e6b777" stroke="#8e7155" strokeWidth="3" /><text x="303" y="180" fontSize="22" fill="#fffaf1">+</text></g>}
      {has("cover") && (
        <g className={cls("cover")}>
          <path d="M108 211 Q113 178 153 176 L259 176 Q277 180 272 216 L252 242 H115Z" fill={MINT} stroke="#507d75" strokeWidth="3" />
          <path d="M143 193 H234 M139 203 H230 M135 213 H226" stroke="#568d81" strokeWidth="4" strokeLinecap="round" /><circle cx="252" cy="194" r="6" fill="#f6d68b" />
        </g>
      )}
      <path d="M102 230 L93 230" stroke="#d98070" strokeWidth="12" strokeLinecap="round" /><path d="M339 254 L330 287" stroke="#60777b" strokeWidth="5" />
    </svg>
  );
}

function Wheel({ cx }: { cx: number }) {
  return <g><circle cx={cx} cy="260" r="48" fill="#34444c" /><circle cx={cx} cy="260" r="31" fill="#f8f0d9" /><circle cx={cx} cy="260" r="19" fill="#9bc5bc" /><circle cx={cx} cy="260" r="7" fill="#637779" /></g>;
}

// 部品1つの絵。rotation（度）だけ回して描く（向きを合わせる手がかり）
export function PartArt({ id, rotation }: { id: PartId; rotation: number }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="part-art">
      <g transform={`rotate(${rotation} 50 50)`}>{PART_DRAWINGS[id]}</g>
    </svg>
  );
}

const PART_DRAWINGS: Record<PartId, React.ReactNode> = {
  wheel: <><circle cx="50" cy="50" r="34" fill="#34444c" /><circle cx="50" cy="50" r="24" fill="#fff0d8" /><circle cx="50" cy="50" r="14" fill="#9bc5bc" /><circle cx="50" cy="50" r="5" fill="#637779" /></>,
  belt: <><rect x="33" y="9" width="34" height="82" rx="17" fill="none" stroke="#52616b" strokeWidth="9" /><circle cx="50" cy="26" r="8" fill="#e4ba6d" /><circle cx="50" cy="74" r="8" fill="#e4ba6d" /></>,
  battery: (
    <>
      <rect x="22" y="19" width="56" height="66" rx="9" fill="#e6b777" stroke="#8e7155" strokeWidth="3" />
      <rect x="28" y="10" width="12" height="12" rx="2" fill="#ca796c" /><rect x="60" y="10" width="12" height="12" rx="2" fill="#60777b" />
      <text x="29" y="46" fontSize="25" fill="#fffaf1">+</text><text x="61" y="46" fontSize="25" fill="#fffaf1">−</text>
    </>
  ),
  cover: (
    <>
      <path d="M8 60 Q12 32 43 30 L85 30 Q96 32 90 61 L78 77 H13Z" fill="#91d2c2" stroke="#507d75" strokeWidth="3" />
      <path d="M28 43 H72 M25 52 H68 M22 61 H64" stroke="#568d81" strokeWidth="4" strokeLinecap="round" />
    </>
  )
};
