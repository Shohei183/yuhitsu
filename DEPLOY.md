# デプロイ手順（Cloudflare Workers + Supabase + R2）

本番構成：**Cloudflare Workers（Next.js ホスティング／OpenNext アダプタ）** ／
Supabase（Auth + Postgres）／ Cloudflare R2（ファイル）。

> 旧 Netlify 構成は無料クレジット枯渇でデプロイ停止のため Cloudflare へ移行。
> `netlify.toml` は当面残置（Cloudflare 稼働確認後に削除可）。

---

## 1. GitHub にリポジトリを push

```bash
git push
```

（secret は `.gitignore` 済みなので入りません）

## 2. Cloudflare でリポジトリを接続

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Import a repository**（Workers 側）
2. GitHub の `yuhitsu` リポジトリを選択
3. ビルド設定：
   - **Build command**: `npx opennextjs-cloudflare build`
   - **Deploy command**: `npx wrangler deploy`
   - Version command は空でOK
   - `wrangler.jsonc` があるので出力・バインディングは自動認識
4. 先に環境変数を入れる（次項）→ Save and Deploy

## 3. 環境変数（プロジェクト → Settings → Variables and Secrets）

`.env.local` と同じ値。`NEXT_PUBLIC_*` はビルド時に埋め込まれるので **Production に必須**。
秘密のものは "Secret"、それ以外は "Text" で登録：

| キー | 種別 | 値 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Text | `https://oxrlfveljtwzdeuyjrkp.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Text | `sb_publishable_...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | `sb_secret_...` |
| `R2_ACCOUNT_ID` | Text | `900fe0c6...` |
| `R2_ACCESS_KEY_ID` | Secret | `2961...` |
| `R2_SECRET_ACCESS_KEY` | Secret | `7fbb...` |
| `R2_BUCKET` | Text | `yuhitsu-files` |
| `NEXT_PUBLIC_SITE_URL` | Text | **初回デプロイ後**に決まる URL（例 `https://yuhitsu.<サブ>.workers.dev`） |

`NEXT_PUBLIC_SITE_URL` を変更したら **再デプロイ**（Retry deployment ではなく新しいビルド）。

## 4. 初回デプロイ後の設定

1. 発行された URL（`https://yuhitsu.xxxx.workers.dev`）を控える
2. その URL を `NEXT_PUBLIC_SITE_URL` に設定 → 再デプロイ
3. **Supabase** → Authentication → URL Configuration:
   - Site URL: `https://yuhitsu.xxxx.workers.dev`
   - Redirect URLs に追加: `https://yuhitsu.xxxx.workers.dev/**`
4. **R2 CORS**：`scripts/r2-cors.mjs` は `*.workers.dev` / `*.pages.dev` を許可済み。
   一度実行して反映：`node scripts/r2-cors.mjs`
   （独自ドメインを使う場合はそのドメインを足してから実行）

## 5. メール送信（Resend → Supabase SMTP）

未設定だと **メンバー招待・パスワードリセットのメールが届きません**（マスターは
ダッシュボードでパスワード設定済みなのでログインには不要）。

1. [resend.com](https://resend.com) → API Keys 作成、送信ドメインを追加（DNS に SPF/DKIM）
2. Supabase → Authentication → Emails → **SMTP Settings**：
   Host `smtp.resend.com` / Port `465` / User `resend` / Pass `<APIキー>` / Sender は認証済みドメインのアドレス
3. ドメイン認証が間に合わなければ当面は Supabase 内蔵メール（時間あたり制限あり）でも動く

---

## 運用開始時の初期設定（マスターでログインして画面から）

1. 年度フォルダは `fy-2026`・`fy-2027`。委員会は 総務／事業 をシード済み
   → 実構成に合わせて追加・改名（ダッシュボードの「委員会」セクション）
2. メンバー管理 → アカウント発行（＝招待メール）で各メンバーを追加
3. メンバー管理 → 選択中年度のロールを割当
4. 必要なら テンプレート編集（/templates）で議案・次第の項目を調整

## ローカルでの確認

```bash
npm run dev        # 通常の開発（.env.local を読む・http://localhost:3000）
npm run cf:preview # Cloudflare Worker としてローカル実行（.dev.vars を読む・:8788）
```

## セキュリティ（ローンチ後）

チャットで共有した `sb_secret` キー・R2 シークレット・Supabase アクセストークンは、
落ち着いたら各ダッシュボードで**再発行（ローテーション）**してください。
Cloudflare 側の環境変数も更新すること。
