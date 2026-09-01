# デプロイ手順（Netlify + Supabase + R2）

本番構成：Netlify（Next.js ホスティング）／ Supabase（Auth + Postgres）／ Cloudflare R2（ファイル）。

---

## 1. GitHub にリポジトリを用意

private リポジトリを作成し push（secret は `.gitignore` 済みなので入りません）：

```bash
git remote add origin https://github.com/<user>/yuhitsu.git
git push -u origin main
```

## 2. Netlify で Import

1. [app.netlify.com](https://app.netlify.com) → Add new site → Import an existing project → GitHub → このリポジトリ
2. Build 設定は `netlify.toml` から自動検出（Build command `npm run build` / Publish `.next` / plugin `@netlify/plugin-nextjs`）。変更不要
3. **Deploy site** を押す前に、環境変数を設定（次項）。または一度デプロイ→環境変数追加→再デプロイ

## 3. 環境変数（Site settings → Environment variables）

`.env.local` と同じ値を登録：

| キー | 値 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://oxrlfveljtwzdeuyjrkp.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_...` |
| `SUPABASE_SERVICE_ROLE_KEY` | `sb_secret_...`（秘密） |
| `R2_ACCOUNT_ID` | `900fe0c6...` |
| `R2_ACCESS_KEY_ID` | `2961...` |
| `R2_SECRET_ACCESS_KEY` | `7fbb...`（秘密） |
| `R2_BUCKET` | `yuhitsu-files` |
| `NEXT_PUBLIC_SITE_URL` | **最初のデプロイ後**に決まる Netlify の URL（例 `https://yuhitsu.netlify.app`） |

`NEXT_PUBLIC_*` はビルド時に埋め込まれるので、`NEXT_PUBLIC_SITE_URL` を変えたら **Trigger deploy → Clear cache and deploy**。

## 4. 初回デプロイ後の設定

1. Netlify の URL（`https://xxxx.netlify.app`）を控える
2. その URL を `NEXT_PUBLIC_SITE_URL` に設定 → 再デプロイ
3. **Supabase** → Authentication → URL Configuration:
   - Site URL: `https://xxxx.netlify.app`
   - Redirect URLs に追加: `https://xxxx.netlify.app/**`（招待・リセットの着地に必要）
4. **R2 CORS**：`*.netlify.app` は許可済み。**独自ドメインを使う場合**は
   `scripts/r2-cors.mjs` の AllowedOrigin にそのドメインを足して `node scripts/r2-cors.mjs`

## 5. メール送信（Resend → Supabase SMTP）

未設定だと **メンバー招待・パスワードリセットのメールが届きません**（マスターは
ダッシュボードでパスワード設定済みなので、あなたのログインには不要）。

1. [resend.com](https://resend.com) → API Keys → 作成、送信ドメインを追加（DNS に SPF/DKIM）
2. Supabase → Authentication → Emails → **SMTP Settings** に Resend の値を入力
   - Host `smtp.resend.com` / Port `465` / User `resend` / Pass `<APIキー>` / Sender は認証済みドメインのアドレス
3. ドメイン認証が間に合わなければ、当面は Supabase 内蔵メール（時間あたり数通の制限あり）でも動く

---

## 運用開始時の初期設定（マスターでログインして画面から）

1. 年度フォルダは `fy-2026`（2026年度）が入っています。委員会は 総務／事業 の2つをシード済み
   → 実際の委員会構成に合わせて追加・改名（ダッシュボードの「委員会」セクション）
2. メンバー管理 → アカウント発行（＝招待メール）で各メンバーを追加
3. メンバー管理 → 選択中年度のロールを割当
4. 必要なら テンプレート編集（/templates）で議案・次第の項目を調整

## ローカルでの確認

```bash
npm run dev    # .env.local を読み込む
```

## セキュリティ（ローンチ後）

チャットで共有した `sb_secret` キー・R2 シークレット・Supabase アクセストークンは、
落ち着いたら各ダッシュボードで**再発行（ローテーション）**してください。
