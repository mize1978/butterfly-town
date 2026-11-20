// 開いたときのログイン確認（GET /api/v1/session）は、返事が遅れることがある（サーバーの起動待ちなど）。
// その間に画面からログイン・登録・ログアウトしたら、遅れて返った確認の結果で上書きしない
export class AccountCheck {
  private version = 0;

  // 確認を送るときに呼び、返事が来たら isCurrent で使ってよいかを確かめる
  begin(): number { return this.version; }
  // 画面からログイン・登録・ログアウトしたときに呼ぶ
  changed() { this.version += 1; }
  isCurrent(token: number): boolean { return token === this.version; }
}
