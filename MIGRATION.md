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
- 2026-09-02: 土台コミット `0850d11`。schema / クライアント / API routes / netlify.toml。
- 2026-09-02: 接続完了。本番DBにスキーマ適用（`725ae85`）。R2 疎通OK。マスター作成済み
  （`yoroizuka@eitex.co.jp` / is_master）。パスワード最小長を下げられず 8桁に変更。
- 2026-09-02: **ストア移行 完了**（`36171a9`）。全ストア Supabase 化、ファイル→R2、
  Supabase Auth、DataProvider。tsc / next build 通過。
- 2026-09-02: ログイン疎通OK。`useTemplate` 無限ループ修正（`5466087`）。R2 CORS 設定。
  ローカルで **上程→次第→配信確定→凍結資料 まで全フロー確認**。`prod-migration` を
  `main` に fast-forward（`cacd632`）。
- 2026-09-02: **本番デプロイ完了**（Netlify `yuhitus.netlify.app` ← `github.com/Shohei183/yuhitsu`）。
  Netlify のサイト保護を解除。`NEXT_PUBLIC_SUPABASE_URL` に `/rest/v1/` が付いていて
  "Invalid path" → コードで URL を origin に正規化（`a945adb`）。
  **本番でログイン成功・スマホからもログイン成功（＝共有DB稼働）。**

## 稼働状況：本番ライブ ✅

`https://yuhitus.netlify.app` — Supabase(Auth+DB) + R2 + Netlify で稼働中。

## RLS 本格化 v2（2026-09-02 夜・要朝レビュー）

`supabase/rls.sql` を**本番DBに適用済み**。permissions.ts の権限モデルを DB 側でも強制。

- **SELECT は従来どおり**（認証済みなら全行）＝読みは一切変えていない
- **INSERT/UPDATE/DELETE のみ capability でゲート**：
  - gians / gian_snapshots ← `editGian`
  - replacement_requests ← `requestReplacement` or `approveReplacement`
  - sidais ← `createSidai`／distributions ← `finalizeDistribution`
  - year_templates ← `editTemplates`／committees ← `editCommittees`
  - role_assignments / role_perm_overrides ← `editRoles`／fiscal_years ← `createYear`
  - file_objects ← `editGian` or `manageFixedFiles`
- `auth_is_master()` で **master は全許可に短絡＝ロックアウトなし**
- ロール判定は「割り当てのあるいずれかの年度で持っていれば可」（緩め・締め出し回避）。
  年度スコープの厳密化はローンチ後の課題
- API route も `member_has_cap()` RPC でサーバー側チェック追加：
  members invite/PATCH ← `manageMembers`、files copy ← `finalizeDistribution`、
  files presign-upload/delete ← `editGian` or `manageFixedFiles`
- **検証済み**：`default_perm` 全ロール×全capを DEFAULT_PERMS と照合一致／
  committee_chair は gian可・sidai/committee/roles/templates 不可／
  executive_director は officer 操作可／master は全可／未認証は全拒否。
  テスト用 auth ユーザーは作成→検証→削除済み（残骸なし）。
- **ロールバック**：`rls.sql` 末尾コメントの do ブロック（緩い「認証済みなら全書き込み」に戻す）
- コミット `<未>`／未 push（`b66e1a9` の次）

## ⚠️ 本番DBにテストデータあり

ユーザーの通しテストで作成：gians 2／sidais 1／distributions 1／file_objects 7。
ローンチ前に消すか、参考例として残すか要判断（消すなら Claude が SQL で対応）。

## 残タスク（運用と並行で可・ブロッカーではない）

- [ ] **Resend SMTP を Supabase に設定**（Authentication → Emails → SMTP）
      — 未設定だとメンバー招待・パスワードリセットのメールが飛ばない。マスターは直設定済み。
- [ ] Supabase → Authentication → URL Configuration に本番URL登録
      （Site URL `https://yuhitus.netlify.app` / Redirect URLs `https://yuhitus.netlify.app/**`）
      — 招待・リセットリンクの着地に必要
- [ ] Netlify env `NEXT_PUBLIC_SITE_URL` を `https://yuhitus.netlify.app` に（メールのリンク生成用）
- [ ] 実運用の委員会構成をダッシュボードで登録（現在は総務／事業のダミー）
- [ ] メンバー招待＋ロール割当
- [ ] 独自ドメインを使うなら R2 CORS に追加（`scripts/r2-cors.mjs`）
- [ ] `notificationStore` は localStorage のまま（差し替え通知のクリア状態・端末ローカル）
- [ ] **ローンチ後：`sb_secret` / R2 secret / Supabase アクセストークン をローテーション**
      （チャットで共有済みのため）
