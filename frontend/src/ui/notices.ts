// トップに出す案内。開いたときの「街の確認」と「ログイン状態の確認」は並んで返ってくるので、
// 案内を出どころごとに持ち、後から返った方で前の案内を上書きしない
export type NoticeSource = "town" | "account";
export type Notices = Partial<Record<NoticeSource, string>>;

const ORDER: NoticeSource[] = ["town", "account"];

// text が null なら、その出どころの案内を消す
export function setNotice(notices: Notices, source: NoticeSource, text: string | null): Notices {
  const next = { ...notices };
  if (text === null) delete next[source];
  else next[source] = text;
  return next;
}

export function noticeList(notices: Notices): string[] {
  return ORDER.flatMap((s) => (notices[s] ? [notices[s]!] : []));
}
