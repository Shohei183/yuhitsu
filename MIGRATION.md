# 本番移行（Supabase + R2） 作業記録

単一LOM（小牧JC）／まっさらスタート／「最後の保存が勝ち」。ローンチ目標：2026-09-04 頃。

## 構成

| 役割 | サービス | 備考 |
|---|---|---|
| 認証 | Supabase Auth | メール＋パスワード、招待メール、リセット |
| DB | Supabase Postgres | 複雑な入れ子ドキュメント（議案・次第・配信・テンプレート）は `jsonb` カラム、関係データ（メンバー・年度・委員会・権限割当・ファイルメタ）は正規カラム |
| ファイル | Cloudflare R2 | S3互換。アップロード/ダウンロードは署名URL（Next.js route handler が発行） |
| メール送信 | Resend | Supabase の SMTP に設定（無料 3,000通/月） |
| ホスティング | Netlify（or Vercel） | 環境変数に各キー |

### 方針：既存ストアを「ハイドレート方式」で温存

`useSyncExternalStore` の同期パターンは維持する。各ストアは `cache / commit / subscribe / getSnapshot` の形を残し、
- 起動時に `<DataProvider>` が Supabase から全行を取得して各 cache を満たす（この規模なら数百KB）
- 変更は cache を楽観的に更新（同期）＋ 非同期で Supabase に書き込み。失敗時は再取得
- コンポーネントはほぼ無改造（`useX()` は同じ型を返す）

例外：
- **認証** … Supabase Auth SDK（非同期セッション）。`AppFrame` のマウントガードを拡張
- **ファイル4種** … すでに `{data,loading}` フックなので、IndexedDB 呼び出しを R2 署名URLに差し替え

---

## あなたの作業（アカウント側・並行で）

### 1. Supabase
1. https://supabase.com → New project（Region: Northeast Asia (Tokyo)）
2. プロジェクト名 `yuhitsu`、DB パスワードを控える
3. Settings → API から `Project URL` と `anon public` キー、`service_role` キー（秘密）をコピー
4. （本番データ投入前に）Settings → 課金で Pro（$25/mo）にするか判断。当面 Free で可

### 2. Cloudflare R2
1. https://dash.cloudflare.com → R2 → Create bucket `yuhitsu-files`（Location: APAC）
2. R2 → Manage R2 API Tokens → Create API token（Object Read & Write、bucket 限定）
3. `Access Key ID` / `Secret Access Key` / `アカウントID`（エンドポイント `https://<accountid>.r2.cloudflarestorage.com`）を控える

### 3. Resend
1. https://resend.com → API Keys → Create
2. 送信ドメインを追加（DNS に SPF/DKIM）。当日までに間に合わなければ `onboarding@resend.dev` で暫定送信可
3. Supabase → Authentication → Email → SMTP settings に Resend の SMTP 情報を入力

### 4. 受け取ったキーを渡してください（.env にセットします）
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=yuhitsu-files
```

---

## 実装タスク（私）

- [ ] 依存追加（`@supabase/supabase-js`, `aws4fetch`）
- [ ] `supabase/schema.sql`（テーブル＋RLS＋既定データ）
- [ ] `src/lib/supabase.ts`（ブラウザクライアント）＋ `src/lib/supabaseAdmin.ts`（route 用）
- [ ] `<DataProvider>` ＋ 各ストアの `hydrate()`
- [ ] ストア移行：memberStore / yearStore / rolePermStore / templateStore / notificationStore
- [ ] ストア移行：gianStore / sidaiStore / distributionStore（jsonb）
- [ ] 認証：`authStore` → Supabase Auth、`AppFrame` ガード、`LoginForm`（ログイン/リセット）、`MemberAdmin`（招待＝route + service role）
- [ ] ファイル：`sharedFilesDb` / `gianFilesDb` / `fixedFilesDb` / `distFilesDb` → R2 署名URL、メタは Supabase
- [ ] `.env.example` ＋ Netlify 設定（`netlify.toml` / `@netlify/plugin-nextjs`）
- [ ] シード：最初の年度・マスターアカウント作成手順
- [ ] E2E 確認（ログイン→議案→上程→次第→配信→ファイル）

## 進捗ログ

- 2026-09-02: 移行方針確定、本ドキュメント作成。着手。
- 2026-09-02: 土台コミット `0850d11`。schema.sql / supabase・r2 クライアント /
  API routes（files 3本・members 2本）/ netlify.toml / .env.example 完了。
  ビルド・型チェック通過。アプリはモックのまま従来どおり動作（新コードは未接続）。
  **次：キー受領 → ストア移行（memberStore→auth→年度系→議案系→ファイル系）。**
