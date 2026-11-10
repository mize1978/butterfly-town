// 街の上に重ねる画面（メニュー・会話）に共通のキー操作。Tab は中だけを巡り、Esc で onEscape を呼ぶ
import type { KeyboardEvent, RefObject } from "react";

export function dialogKeys(ref: RefObject<HTMLElement | null>, onEscape: () => void) {
  return (e: KeyboardEvent) => {
    const root = ref.current;
    if (e.key === "Escape") { e.preventDefault(); onEscape(); return; }
    if (e.key !== "Tab" || !root) return;
    const items = [...root.querySelectorAll<HTMLElement>("button:not([disabled])")];
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
}
