# デプロイ手順（Vercel）

このアプリは **フロントエンドのみ**（サーバー・DB なし）。ビルドすると静的アセット＋
軽量なサーバーレス関数になり、Vercel がそのまま配信できる。環境変数の設定は不要。

> **データはブラウザごとに独立**（localStorage / IndexedDB）。
> URL を配っても、閲覧者それぞれが自分のブラウザ内でしかデータを共有できない
> ＝「常時触れるデモ」用。複数人で同じ議案を共有するにはバックエンド（Supabase 等）が必要。

初回ログイン：`master@komaki-jc.example` ／ パスワード `jc`
（初回アクセス時にブラウザ内へシードデータが自動投入される）

---

## 方法A：Vercel CLI（最短・GitHub 不要）

```bash
npm i -g vercel
vercel login
vercel            # プレビュー環境へデプロイ（初回は対話でプロジェクト名等を確認）
vercel --prod     # 本番URLへ反映
```

- ルート設定はすべて自動検出（Framework: Next.js / Build: `next build` / Install: `npm install`）。
- 2 回目以降は `vercel --prod` だけ。

## 方法B：GitHub + Vercel ダッシュボード（継続開発向け）

1. GitHub で **private リポジトリ**を作成し、このプロジェクトを push
   ```bash
   git remote add origin https://github.com/<user>/yuhitsu.git
   git push -u origin main
   ```
2. [vercel.com/new](https://vercel.com/new) → リポジトリを Import → **Deploy**（設定変更不要）
3. 以降は `main` に push するたび自動で本番デプロイ、PR ごとにプレビューURL。

---

## 補足

- **Node**：`.nvmrc` で 22 を指定。Vercel のプロジェクト設定 → General → Node.js Version が
  20 以上になっていること（デフォルトで可）。
- **含めないもの**：`サンプル/`（約250MB の参照用PDF・アプリ実行に不要）と `.claude/` は
  `.gitignore` 済み。議案資料はデプロイ後、画面からアップロードして IndexedDB に入る。
- **ビルド確認**（ローカル）：
  ```bash
  npm run build && npm start
  ```
- **プレゼン当日にローカルで見せる場合**：`start-prod.bat`（build → start）でも可。
  URL 配布が不要ならこれが一番確実。
