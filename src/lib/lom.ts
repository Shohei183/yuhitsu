// ─────────────────────────────────────────────────────────────
// 団体（LOM）名。デプロイごとに差し替え可能。
//
//  別の LOM で使う場合は、その LOM 用に
//   - 別 Supabase プロジェクト
//   - 別 R2 バケット（または接頭辞）
//   - 別 Cloudflare Worker（別サブドメイン）
//  を用意し、環境変数 NEXT_PUBLIC_LOM_NAME にその団体名を入れるだけでよい。
//  （NEXT_PUBLIC_* はビルド時に埋め込まれる）
// ─────────────────────────────────────────────────────────────

// 既定値（env 未設定なら小牧JC）。実際の表示名は app_settings.lom_name が
// あればそちらが優先される（settingsStore の lomName() / useLomName()）。
export const LOM_NAME_DEFAULT =
  (process.env.NEXT_PUBLIC_LOM_NAME ?? "").trim() ||
  "一般社団法人小牧青年会議所";
