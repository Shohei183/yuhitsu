# yuhitsu

JC向け アジェンダ・議案管理システムの **プロトタイプ**（UI確認用）。

- 現段階は **モックデータのみ**で動作します。Supabase 等の外部接続はまだ行いません。
- モックデータの初期値は [`src/lib/mockData.ts`](src/lib/mockData.ts)。
- 議案の**状態・スナップショット・差し替え申請**はブラウザの `localStorage` に保存します（[`src/lib/gianStore.ts`](src/lib/gianStore.ts)）。外部サービスではなくローカル保存なので、この段階の方針（外部接続なし）のままです。
- **オフライン同期の実験**は `/sync-lab`（[同期ラボ](#同期ラボ-sync-lab実験)）で。Yjs（CRDT）＋ BroadcastChannel ＋ IndexedDB のみで、クラウドなしで動きます。
- **議案・次第・配信データのダウンロード**（[`src/lib/download.ts`](src/lib/download.ts)）：閲覧画面の「ダウンロード」ボタンで、そのページの CSS を丸ごと同梱した**自己完結の単一 HTML ファイル**として保存。オフラインでそのまま開け、ブラウザの印刷から A4 PDF にもできる。委員会の共有用フォルダは各ファイルを個別にダウンロード可。

## 動かし方

```bash
npm install
npm run dev
```

http://localhost:3000 を開きます。**未ログインなら `/login` にリダイレクト**されます。

- `/login` … **ログイン画面**（メール＋パスワード／パスワード再設定はダミー）。デモ用アカウントは画面下に表示（全員パスワード `jc`）
- `/` … **年度フォルダのダッシュボード**（差し替え申請の通知／固定ファイル／議案・次第テンプレート〔`editTemplates` 保持者のみ表示〕／委員会〔`editCommittees` で追加・名称変更〕／「期間と配信」〔委員会と同じフォルダカード。📦 予定者期間の次第・配信／📦 本年度の次第・配信 の 2 枚。クリックで `setPeriod(p)` してから `/sidai` へ。カード下の「次第作成」ボタンは `can.createSidai` 保持者のみ〕）。上部バーの年度タブで年度が切り替わる（期間トグルは廃止）
- `/members` … **メンバー管理**（マスターのみ）。アカウント発行・無効化＋**選択中年度のロール割当**（担当委員会はマスター以外の全員に割当可）＋氏名・メールの変更
- `/roles` … **ロール権限の設定**（マスターのみ）。ロールを選び、操作権限をチェックで切り替える
- `/templates` … **議案・次第テンプレートの管理**（`editTemplates` 権限）。協議／審議／決算協議／決算審議／基本方針／次第の6タブ（「前回までの流れ」は 協議・決算協議・基本方針で表示）
- `/committee/[committeeId]` … **委員会フォルダ**（「議案構築」「共有用フォルダ」への導線）
- `/committee/[committeeId]/gian` … **議案構築エリア**（その委員会の議案一覧＋新規作成＋複製）
- `/committee/[committeeId]/shared` … **共有用フォルダ**（実ファイルアップロード）
- `/gian/[gianId]` … **議案構築画面**（3カラム）
- `/gian/[gianId]/view` … **議案の閲覧画面**（読み取り専用）。ツールバーの「PDF出力（A4）」で `window.print()` → ブラウザの「PDFに保存」（`@page { size: A4 }` で A4 に収まるよう調整）。`?snap=<id>` でスナップショット時点
- `/sidai` … `can.createSidai` を持つユーザーは**次第一覧**（作成・複製・閲覧・編集）、持たないユーザーは**配信データ一覧**のみ（確定済みの配信データを `/haishin/[distId]` で閲覧）。いずれも選択中の年度・期間で絞り込み、上部の期間ボタンで切り替え（見出し・crumb も `SidaiList` 内で権限により出し分け）
- `/sidai/[sidaiId]` … **次第作成画面**
- `/sidai/[sidaiId]/view` … **次第の閲覧画面**
- （`/haishin` インデックスは廃止。ダッシュボードの「期間と配信」フォルダカードは `/sidai` へリンク）
- `/haishin/[distId]` … **配信データ画面**（凍結された次第のみを表示。議案は次第内のリンクから別タブで開く。「収録議案」一覧は廃止）
- `/haishin/[distId]/gian/[gianId]` … **配信データの収録議案**（確定時点の凍結コピーを1枚のドキュメントで表示。資料も確定時点のファイルを開ける＝`distFilesDb` へ Blob をコピー済み）

### ログイン・組織構造（要件定義書 3.8〜3.12）

すべて `localStorage` ＋ ダミーデータ。実メール送信・トークン・ハッシュ化・Supabase 認証は次ステップ。

| ストア | localStorage キー | 役割 |
| --- | --- | --- |
| [`memberStore.ts`](src/lib/memberStore.ts) | `yuhitsu.members.v1` | LOM 全体のメンバー（年度非依存）。マスター1名＋14名。発行・退会 |
| [`authStore.ts`](src/lib/authStore.ts) | `yuhitsu.auth.v1` | ログインセッション。パスワード再設定（ダミー） |
| [`yearStore.ts`](src/lib/yearStore.ts) | `yuhitsu.years.v5` | 年度フォルダ（2026／2027／2028年度）。委員会・メンバー権限（人×年度のロール割当）。固定ファイルは IndexedDB へ分離。会員拡大委員会に基本方針議案 gian-004 |
| [`activeViewStore.ts`](src/lib/activeViewStore.ts) | `yuhitsu.active-view.v2` | 選択中の年度・期間（予定者／本年度）・デモ用ロール上書き。期間は `/` の「期間と配信」または `/sidai` の期間ボタンで設定 |
| [`rolePermStore.ts`](src/lib/rolePermStore.ts) | `yuhitsu.role-perms.v2` | ロール×操作権限の「既定からの上書き分」。既定は [`permissions.ts`](src/lib/permissions.ts) の `DEFAULT_PERMS` |
| [`templateStore.ts`](src/lib/templateStore.ts) | `yuhitsu.templates.v5` | 年度ごとの議案（協議／審議／決算協議／決算審議／基本方針）・次第テンプレート |
| [`notificationStore.ts`](src/lib/notificationStore.ts) | `yuhitsu.notif-dismissed.v1` | ダッシュボードの差し替え申請通知で「クリア」した申請 id（このブラウザ内） |
| [`sharedFilesDb.ts`](src/lib/sharedFilesDb.ts) | IndexedDB `yuhitsu-shared-files` | 委員会ごとの共有用フォルダ。**ファイル実体（Blob）ごと**保存 |
| [`gianFilesDb.ts`](src/lib/gianFilesDb.ts) | IndexedDB `yuhitsu-gian-files` | 議案ごとの資料（審議対象／参考）。**ファイル実体（Blob）ごと**保存 |
| [`fixedFilesDb.ts`](src/lib/fixedFilesDb.ts) | IndexedDB `yuhitsu-fixed-files` | 年度ごとの固定ファイル。**ファイル実体（Blob）ごと**保存 |
| [`distFilesDb.ts`](src/lib/distFilesDb.ts) | IndexedDB `yuhitsu-dist-files` | 配信データに凍結コピーされた資料。配信確定時に議案資料の Blob を複製し、確定時点のファイルを後から開ける |

- **上部バー**（[`TopBar.tsx`](src/components/TopBar.tsx)、[`AppFrame.tsx`](src/components/AppFrame.tsx) が認証ガード）：**製品ロゴ「ユーヒツ(仮)」**（`.logo`＝角丸バッジの「ユ」＋ワードマーク。のちに画像ロゴへ差し替える前提の仮表記。@1100px 以下ではワードマーク非表示）／LOM名／年度タブ／ロールバッジ／デモ用ロール切替／ログアウト／`editTemplates` で「テンプレート」／マスターで「メンバー管理」「ロール権限」リンク。高さ `--topbar-h: 58px`（`globals.css`）＋各要素のフォントを約 1.2 倍。`position:fixed` 系レイアウトはこの変数を参照して自動追従。**期間（予定者期間／本年度）のトグルは廃止** — 期間はダッシュボードの「期間と配信」フォルダカード（クリックで `setPeriod` → `/sidai`）／その「次第作成」ボタン（`can.createSidai` 保持者のみ）、または `/sidai` 上部の期間ボタンで選ぶ（`activeViewStore.setPeriod`）。
- **年度タブ**：切り替えると委員会一覧・議案・配信フォルダ・自分のロール・`/members` のロール割当対象年度が年度ごとに変わる。
- **メンバー管理（`/members`・マスター）**（[`MemberAdmin.tsx`](src/components/MemberAdmin.tsx)）：アカウント発行・**無効化／有効化**（LOM 全体・年度非依存）＋ **選択中年度のロール割当**（`editRoles` 権限で `<select>` 編集、`yearStore.setAssignment()`）。担当委員会は**マスター以外の全メンバー**で選択可（**現在の委員会フォルダ名**を参照）。列は 氏名／ロール／担当委員会／**変更**／アカウント（メール・状態列は非表示。無効メンバーは氏名に「無効」タグ）。「変更」で氏名・メールアドレスの編集ダイアログ（`memberStore.updateMember()`、メール重複は拒否）。※ ダッシュボード（`/`）の「メンバー権限」セクションは廃止しここへ集約。
- **ロール（仮）**：JC の役職に対応（[`yearStore.ts`](src/lib/yearStore.ts)）。
  `master`（LOM管理者・アカウント属性）／`president`（理事長）／`executive_director`（専務）／`vice_president`（副理事長）／`auditor`（監事）／`secretary_general`（事務局長）／`committee_chair`（委員長）／`committee_member`（委員会メンバー）／`director`（理事）。
  実効ロール＝デモ上書き → マスター属性 → 年度割当（[`useOrg.ts`](src/lib/useOrg.ts) の `useEffectiveRole` / `useCan`）。
  既定権限の目安：理事長・専務・事務局長＝配信までひととおり操作可／副理事長＝上程・差し替え承認まで／委員長・理事＝上程まで／委員会メンバー・監事＝議案編集のみ（すべて `/roles` で変更可）。
- **ロール権限の設定（`/roles`・マスターのみ）**：[`RolePermAdmin.tsx`](src/components/RolePermAdmin.tsx)。ロール（master 以外の8種）を選び、12 個の操作権限をチェックボックスで切り替える。変更は `rolePermStore` に「既定からの差分」として保存され、`useCan()` が即座に反映（該当ロールのユーザー・デモ表示で切替中のロールに効く）。マスターは常に全許可（編集不可）。「このロールを既定に戻す」で差分を破棄。
  - 画面で強制されている権限：議案の編集・新規作成・複製（`CommitteeGianList`）／会議へ上程・差し替え申請・その承認（`GianBuilder`）／次第の作成・複製・編集（`SidaiList` は権限なしだと配信データ一覧のみ表示／`SidaiBuilder` は権限なしだと `/sidai/[id]/view` へリダイレクト）／配信確定・再配信確定（同）／議案・次第テンプレートの編集（`TemplateAdmin`）／**委員会フォルダの編集**（`editCommittees`・`YearHome` の委員会追加・名称変更）／固定ファイルの登録更新（`YearHome`）／メンバー権限の割当（`/members`・`editRoles`）／メンバー管理（`/members`・`master` のみ）
  - **差し替え申請の通知**：`approveReplacement` を持つロールでダッシュボード（`/`）上部に、未処理（pending）の差し替え申請が委員会・議案名・理由つきで一覧表示（[`useNotifications.ts`](src/lib/useNotifications.ts) の `useReplacementNotifications()`）。議案名クリックで `/gian/[id]`、各行「クリア」／「すべてクリア」で非表示（`notificationStore` にこのブラウザ内で記録）
  - 「定義のみ」表示の権限（年度フォルダの新規作成）は次ステップで画面制御に反映
  - 非該当ロールでは対象ボタンが disabled になり、上部バーの「デモ表示」で切り替えて確認できる。

### 議案・次第テンプレート（要件定義書 3.5）

固定ファイルから分離し、[`templateStore.ts`](src/lib/templateStore.ts) ＋ `/templates`（[`TemplateAdmin.tsx`](src/components/TemplateAdmin.tsx)）で年度ごとに管理する。タブ名は「協議／審議／決算協議／決算審議／基本方針／次第」（「テンプレート」の語は付けない）。議案 **5 種類** ＋ 次第:

- **協議**：協議議案の事業要綱・事業概要の項目。**「前回までの流れ（意見と対応）」あり**（`GianKind` = `"協議"`）。
- **審議**：審議議案の項目。前回までの流れは非表示（`"審議"`）。
- **決算協議**：決算議案（協議）の項目。**前回までの流れあり**（`"決算協議"`）。既定は事業概要末尾に「決算額・予算差異の説明」。
- **決算審議**：決算議案（審議）の項目。前回までの流れは非表示（`"決算審議"`）。既定は事業概要末尾に「決算額・予算差異の説明」。
- **基本方針**：事務局事業計画などの基本方針議案（`"基本方針"`）。`kihonOutline`＝「基本方針（本文）」の見出し（既定は「基本方針」1 項目）、`kihonOverview`＝「事業計画」の項目（既定 4 項目）。**前回までの流れあり**。サンプルは `サンプル/事務局基本方針vr1.docx`。
- **次第**：区分（見出し）の並び。`createSidai()` がこの並びで新規次第の区分見出しを生成する（編集が即反映される）。
- 「前回までの流れ」の表示可否は [`gianStore.showsPriorFeedback(kind)`](src/lib/gianStore.ts)（`"協議"` / `"決算協議"` / `"基本方針"` が true）。GianBuilder・GianView・`duplicateGian` が共用。
- 初期値は [`mockData.ts`](src/lib/mockData.ts) の `OUTLINE_LABELS` / `OVERVIEW_LABELS`（基本方針は `KIHON_OUTLINE_LABELS` / `KIHON_OVERVIEW_LABELS`）。
- 項目名（表示ラベル）と項目 ID は分離（`TemplateItem { id, label }`）。編集は `editTemplates` 権限、それ以外は閲覧のみ。年度ごとに「既定に戻す」可能。
- `createGian({yearId, committee, kind})` が `getGianTemplate(yearId, kind)` でテンプレートを選ぶ（協議→`kyogi`、決算協議→`kessanKyogi`、決算審議→`kessanShingi`、基本方針→`kihon`、他→`shingi`）。
- ダッシュボード（`/`）の「議案・次第テンプレート」セクション（`editTemplates` 保持者のみ表示）／上部バーの「テンプレート」リンクから入る。

### 基本方針議案（要件定義書 3.5／サンプル『事務局基本方針vr1.docx』）

`GianKind` に `"基本方針"` を追加。委員会ごとの事務局事業計画などをこの種別で作る（`/committee/[id]/gian` の「＋ 新規作成：基本方針」）。

- **提案議題ブロック・議案上程スケジュールは無し**：基本方針は `isKihon(kind)` 分岐で、上部の「◯月度定例理事会 提案議題」の行・「表記議題について…として提案します」の行・文書作成者/作成日時/礼状/メディア/確認日・**議案上程スケジュール**を出さず、代わりに **`● 配属メンバー`**（役職＋氏名の表・`Gian.assignedMembers: AssignedMember[]`、行の追加/削除可）を置く。表示するのは LOM 名・件名（`topic`）・配属メンバーのみ。
- **本文構成**（`GianBuilder` / `GianView` が `isKihon(kind)` で分岐）：件名 → 配属メンバー →「基本方針」（本文）→「事業計画」→「事業予定」（`implementationSchedule` を時期／内容の表）→ **「委員会予算」**（`Gian.committeeBudget: { income, expense: BudgetLine[] }`。収入の部／支出の部を別々の表で編集・行の追加/削除可。**合計行は入力金額から自動計算**〔`format.sumAmounts` で数字を抽出して合算・`jpNum` で 3 桁区切り〕）→「前回までの流れ」→「資料」。
- **「事業計画」＝自由編集リスト**（`GianBuilder` の `PlanItemsSection`。`gian.overview` を流用）：各項目は **上段＝事業名（`label` を自由編集）／下段＝関連議案の紐づけ**。「＋ 事業を追加」「×」で **項目数も自由に増減**（`addOverviewItem`／`removeOverviewItem`／`updateOverviewLabel`）。`body` は使わない。閲覧画面は「事業名／関連議案（協議）」を並べる。
- **関連議案リンク**：`TemplateItem` の `linkedGianId?`。選択肢は **自分以外の「協議」議案のみ**（`linkOptions` のフィルタ `g.kind === "協議"`）。閲覧画面は 🔗 チップで別タブに開ける。
- **前回までの流れの一括削除**：`PriorFeedbackSection` のヘッダに「すべて削除（配信前）」ボタン（`onClearAll` → 確認 → `priorFeedback: []`）。加えて **配信確定時、基本方針の凍結コピーからは `priorFeedback` を自動除外**（`finalizeDistribution` 内・外部配信のため）。
- seed: `gian-004`（会員拡大委員会・基本方針・editing。配属メンバー4名・委員会予算・事業計画 1 項目め〔総会の運営について〕が gian-002〔協議〕へリンク）。

### 議案の資料（審議対象資料・参考資料）

共有用フォルダと同じ方式で **実ファイルをアップロード**する（[`gianFilesDb.ts`](src/lib/gianFilesDb.ts) ＝ IndexedDB `yuhitsu-gian-files`、議案 id ×カテゴリ〔review/reference〕で Blob＋メタを保存）。

- 議案構築画面の右カラム＝[`GianResourcePanel.tsx`](src/components/GianResourcePanel.tsx)：カテゴリごとにドラッグ＆ドロップ／ファイル選択で追加、名前クリックで**開く**、削除（1ファイル 20MB まで・形式自由）。上程済み（編集不可）ではアップロード欄なし・閲覧のみ。
- ファイルを開くときは [`sharedFilesDb.openFileAsync(name, fetchBlob)`](src/lib/sharedFilesDb.ts)：**PDF・画像・テキストは新しいタブで表示**、それ以外はダウンロード。IndexedDB からの Blob 取得は非同期なので、クリック直後（＝ユーザー操作中）に `window.open("about:blank", "_blank")` で空タブを先に開き（**`noopener` を付けると戻り値が null になり参照を保持できないので付けない**。自前の blob: URL なので安全）、「読み込み中…」を表示、Blob 準備後に `holder.location.replace(blobUrl)` でそのタブを差し替える。`await` 後に `window.open` するとポップアップブロックで飛ばない／空タブだけ開く不具合になる。
- 議案閲覧画面（[`GianView.tsx`](src/components/GianView.tsx)）も同じ一覧を開くリンクで表示。
- **旧方式は廃止**：`サンプル/{審議,参考}/` の手動配置と `審N-◯◯.pdf` 命名でのリンク状態自動判定、`/api/files` ルート、`Gian.reviewResources`/`referenceResources` の編集 UI。
- 配信確定時は資料メタ（名前・サイズ）を `DistributionPackage.gianFiles` に凍結記録（実体は含めない）。配信データ画面はその一覧を表示。

### 議案構築画面の左カラム＝ページ移動用ナビ

資料のフォルダツリーから、ページ移動用のナビゲーション（[`GianBuilder.tsx`](src/components/GianBuilder.tsx) の `GianNav`）に変更。
議案を閲覧／委員会フォルダ／議案構築（一覧）／共有用フォルダ／同じ委員会の他の議案／年度フォルダ（トップ）／次第作成／テンプレート へのリンク。
（議案 id → 所属委員会は [`yearStore.findCommitteeByGian()`](src/lib/yearStore.ts) ／ `useOrg.useCommitteeOfGian()`）

### 固定ファイル（[`YearHome.tsx`](src/components/YearHome.tsx) の FixedFilesSection）

- 共有用フォルダ・議案資料と同じ IndexedDB 方式（[`fixedFilesDb.ts`](src/lib/fixedFilesDb.ts) ＝ `yuhitsu-fixed-files`、年度 id で Blob＋メタ保存）。
- `manageFixedFiles` 権限があればドラッグ＆ドロップ／ファイル選択でアップロード、名前クリックでダウンロード、削除（20MB・形式自由）。それ以外は非表示。
- 旧方式（`サンプル/{年度}/固定ファイル/*.pdf` ＋ `/api/fixed` ルート ＋ `FiscalYear.fixedFiles`）は廃止。`src/app/api` は空になった（API ルートなし）。

### 委員会フォルダ（要件定義書 3.8）

ダッシュボード（`/`）の委員会カードから **`/committee/[committeeId]`** へ。委員会 id は年度ごとに一意（`cm-2027-seishonen` 等）。

- **委員会フォルダの編集**（`editCommittees` 権限）：ダッシュボードの「委員会」セクションで「＋ 委員会を追加」（`yearStore.addCommittee(yearId, name)`）、各カードの「名称変更」（`yearStore.renameCommittee(committeeId, name)`）。担当委員会の `<select>`（`/members`）はこの名前を即参照する。

- **`/committee/[committeeId]`**（[`CommitteeFolder.tsx`](src/components/CommitteeFolder.tsx)）：「議案構築」「共有用フォルダ」の 2 つのサブフォルダカード（議案件数・状態内訳、ファイル件数を表示）。
- **`/committee/[committeeId]/gian`**（[`CommitteeGianList.tsx`](src/components/CommitteeGianList.tsx)）：その委員会が持つ議案の一覧（協議／審議／決算協議／決算審議・状態バッジ）。`editGian` 権限があれば「＋ 新規作成」（4 種）＋ 各行に **複製**（同種別）／協議行は「審議へ複製」／決算協議行は「決算審議へ複製」。`gianStore.createGian()` / `duplicateGian(sourceId, targetKind?)` ＋ `yearStore.addGianToCommittee()` して `/gian/[id]` へ。下書き（編集中・非モック）は「削除」可。
- `duplicateGian`：本文・スケジュールを引き継ぎ、`status:"editing"`・スナップショット/申請リセット。種別変更時は `proposalType` と表題を調整。「前回までの流れ」は**複製先が協議系（協議・決算協議）のときのみ**引き継ぎ、それ以外へ複製するとクリア。
- **`/committee/[committeeId]/shared`**（[`SharedFolder.tsx`](src/components/SharedFolder.tsx)）：**実ファイルのアップロード**。ファイル選択ボタン／ドラッグ＆ドロップ（複数可・形式自由・1ファイル 20MB まで）→ [`sharedFilesDb.ts`](src/lib/sharedFilesDb.ts) が **IndexedDB にファイル実体（Blob）＋メタデータ**を保存。一覧はファイル名クリックで**開く**（`openFileAsync()`：PDF・画像・テキストは新タブ、他は `<a download>`）、行の「ダウンロード」ボタンで**個別に保存**（`downloadFileAsync()`：形式を問わず必ず保存）、行から削除。外部ストレージ（Supabase Storage / R2）は使わずブラウザ内で完結。ID発行・タグ・スナップショット・承認フローなし（要件定義書 3.8 の「単純な置き場」）。動作確認時のリセットは `indexedDB.deleteDatabase("yuhitsu-shared-files")`。
- 導線のみで、議案構築画面（テンプレート反映・資料一覧・上程フロー）の実装はそのまま。新規作成した議案（`gianStore` のみに存在）を `/gian/[id]` が表示できるよう、ルートを [`GianBuilderPage.tsx`](src/components/GianBuilderPage.tsx)（クライアントで `gianStore` ／ mock を解決）経由に変更。
- `editGian` 権限を「議案の編集・新規作成」に改め、`enforced` に昇格（新規作成ボタンの表示制御に反映）。

### 議案構築画面のレイアウト（3カラム・横幅いっぱい）

画面全体の横幅を使い切る3カラム。左右カラムは `clamp()` でウィンドウ幅に合わせて伸縮（左 196〜300px／右 300〜480px）、中央が残りを取る。横 980px 未満では縦積みにフォールバック。高さは常にビューポートいっぱいで各カラムが独立スクロール。

| カラム | 内容 |
| --- | --- |
| 左 | ページ移動用ナビ（`GianNav`）：議案を閲覧／委員会フォルダ／議案構築一覧／共有用フォルダ／同じ委員会の他議案／トップ／次第作成／テンプレート |
| 中央 | 本文：提案議題ヘッダー → 事業要綱 → 事業概要 → 前回までの流れ（意見と対応）※**協議・決算協議のみ表示**（審議・決算審議は非表示。`showsPriorFeedback(kind)`） |
| 右 | 資料（審議対象資料・参考資料）：カテゴリごとにドラッグ＆ドロップ／ファイル選択でアップロード、名前クリックで開く（PDF等は新タブ）、削除。IndexedDB 保存 |
| 上部バー | 全カラム横断。パンくず／同時編集の表示／同期／ステータス／下書き保存・会議へ上程 |

配色は濃紺ブルーのアクセント（`--accent: #2f5fa8`）を基調。CSS 変数パレットは [globals.css](src/app/globals.css) にまとめてあり、ここを変えると全体の色が変わる。本文は 14px、見出し・ラベル・表ヘッダは 12〜16px の型階層。

Node.js は winget で導入した LTS を使用しています（`C:\Program Files\nodejs`）。
`npm` が PATH に無いターミナルでは、新しいターミナルを開き直すか
`C:\Program Files\nodejs` を PATH に追加してください。

## 議案構築画面でできること（モック）

要件定義書 3.2 / 3.6、モックアップ（`mockups/mockup_gian_kouchiku.html`）、
および実際の議案フォーマット `4月度例会の件.docx`（小牧青年会議所 3月度定例理事会提案議題）
から全テンプレート項目を洗い出して再現しています。

### テンプレート項目（`4月度例会の件.docx` より）

- **ヘッダー（提案議題ブロック）**：発行元LOM名／上程先会議名／提案議題／提案区分／提案日／提案者（役職・氏名）／
  ● 文書作成者／● 作成日時／● 礼状の発送／● メディア依頼書／
  ● 議案上程スケジュール（回数・上程会議名・会議開催日時・上程形式の表）／● 担当副理事長 確認日
- **事業要綱（全6項目）**：1.事業名称 2.事業実施に至る背景 3.事業の対象者 4.事業目的 5.検証の指標 6.目的達成によって期待される効果
- **事業概要（全9項目）**：1.実施日時 2.実施場所 3.予算総額 4.参加員数計画並びに参加推進方法 5.実施組織 6.実施までのスケジュール 7.実施内容 8.前年度よりの引き継ぎ内容 9.その他
- **審議対象資料・参考資料**（右カラムでアップロード。上記「議案の資料」参照）
- **前回までの流れ（意見と対応）**：**協議・決算協議のみ表示**（審議・決算審議は非表示）。会議（回）ごとに `● 会議名` ／ `● 開催日` ／ 形式をヘッダー行に、その下へ「意見 N：／対応 N：」のペアを罫線付きの表で並べる。会議・ペアの追加・削除可

| 項目 | 挙動 |
| --- | --- |
| ヘッダー各項目 | 編集可（ローカル state のみ、保存はしない） |
| 議案上程スケジュール | 回数／上程会議名／会議開催日時／上程形式を編集。「＋ 上程スケジュールの行を追加」で行追加、各行「×」で削除（全議案種別で共通） |
| 事業要綱／事業概要 | 年度の議案テンプレート（協議／審議）の項目を表示。各項目の中身を肉付け。未記入は「未記入」バッジ |
| 事業概要「実施までのスケジュール」 | 本文テキストではなく **日付／内容の2列テーブル**で編集。行の追加・削除可。データは `Gian.implementationSchedule`（`ScheduleEntry[]`） |
| 資料（審議対象／参考） | ドラッグ＆ドロップ／ファイル選択でアップロード（IndexedDB）。名前クリックで開く（`openFileAsync`：PDF・画像・テキストは新タブ、他はダウンロード）、削除。上程済みは閲覧のみ |
| 下書き保存 | 編集は都度自動保存。ボタンを押すと **一時スナップショット**（下記）を保存 |
| 同期する | オフライン編集→手動同期のイメージ。押すと **一時スナップショット** を保存 |

### 上程フロー（[`src/lib/gianStore.ts`](src/lib/gianStore.ts)）

状態は **編集中 → 上程済み → 配信確定** の3段階。トップバーのバッジと連動して実際に機能する。

| 操作 | 挙動 |
| --- | --- |
| 編集中 | 本文・資料一覧を自由に編集。変更は都度 `localStorage` に保存 |
| 「会議へ上程」 | 確認 → **その時点の議案の完全コピーをスナップショット保存** → 状態を「上程済み」へ → 本文・資料一覧を編集ロック |
| 上程済み | トップバーに「差し替え申請」ボタン。押すと理由を入力し**承認待ち**に |
| 承認（仮）／却下（仮） | 中央下部「上程フロー・履歴」に表示。承認すると状態を「編集中」に戻す（※承認機能は仮実装） |
| 「配信確定にする（モック）」 | スナップショットを取り「配信確定」へ（完全ロック）。本来は次第作成／配信フローで行う |
| 「状態をリセット」 | この議案を初期状態に戻す（動作確認用） |
| スナップショット履歴 | 「上程フロー・履歴」に一覧。各行を開くとその時点の提案議題・記入状況・資料一覧を表示 |
| スナップショット2種類 | **📌 上程時**（`kind: "submission"`）＝ラベル付き（例：会議へ上程〔3月度定例理事会〕）で**永続保存**。**💾 下書き・同期**（`kind: "autosave"`）＝下書き保存／同期のたびに保存する保険用の一時記録で、**直近5件のみ**保持するローリング方式（6件目で最古の1件を自動削除）。履歴欄では色分け（アクセント色 vs 琥珀色）と左罫線（実線 vs 破線）とアイコンで区別 |
| 上程済み議案の一覧 | `listSubmittedGians()` で取得。次第作成画面のパレットに表示、議案一覧にも件数を表示 |

## 議案の閲覧画面（[`GianView.tsx`](src/components/GianView.tsx)）

完成した議案を **1枚の議案書ドキュメント**として表示（読み取り専用）。編集画面の3カラムではなく、実際に読む／印刷する体裁。

- 提案議題ヘッダー → 事業要綱 → 事業概要（スケジュール表含む）→ 前回までの流れ（協議・決算協議・基本方針のみ）→ 資料（審議対象／参考）。基本方針は前述の専用構成。
- ツールバー：`← 議案一覧`／`編集画面へ →`／`ダウンロード`（自己完結 HTML・[`downloadDocHtml`](src/lib/download.ts)）／`PDF出力（A4）`（「次第作成へ」リンクは廃止）。配信データ画面の凍結議案（`FrozenGianView`＝`GianView` に `toolbar` prop）でも同じ「ダウンロード」ボタンが出る
- 入口：議案構築画面トップバーの「閲覧」／次第作成画面の議案チップ「議案を開く ↗」／上程フロー履歴の「この時点の内容を全文表示 →」（`?snap=<id>`）
- **本文中の数字は 3 桁区切り表示**（[`format.formatDocNumbers`](src/lib/format.ts)）：4 桁以上の連続数字にカンマを入れる。**直後が「年」の数字（西暦）は対象外**。既にカンマ入り・3 桁以下はそのまま。事業要綱／事業概要の本文・前回までの流れ・事業予定／実施スケジュールの内容欄に適用。金額の合計は `jpNum`
- **資料は開くリンク**：IndexedDB（`gianFilesDb`）のファイルを名前クリックで `openFileAsync` で開く（PDF等は新タブ、他はダウンロード。クリック直後に空タブを開くのでポップアップブロックされない）。配信データ画面の凍結表示（`frozenFiles` prop）でも同様に開ける＝実体は `distFilesDb`（`getDistFileBlob(id)`）に確定時点でコピーされている
- `@media print` 対応（ツールバー非表示・余白調整）

## 次第作成画面（[`src/lib/sidaiStore.ts`](src/lib/sidaiStore.ts) / [`SidaiBuilder.tsx`](src/components/SidaiBuilder.tsx)）

会議の進行表（次第）を作成する。次第は `localStorage` に保存。初期データとして `sidai-seed`（2026年7月度定例理事会、`mockups/mockup_sidai.html` ベース）を投入済み。

- **中央＝次第作成エリア**：先頭に発行元LOM名＋会議名。区分見出し（開会／協議事項 など）ごとに「＋ 項目を追加」があり、その区分の末尾（次の見出しの直前）に定型進行／空欄記入／ファイルリンク行を挿入。▲▼で並び替え・×で削除。最下部の「＋ 区分見出し」で新しい区分を追加
- **行の種別**：
  - `heading` 区分見出し（開会／協議事項 など）
  - `progress` 定型進行項目（時刻・項目名・担当者）
  - `blank` 空欄記入項目（その場で記入する欄つき）
  - `filelink` ファイルリンク項目（上程済み議案 `linkedGianId` **または** 年度フォルダの固定ファイル `linkedFixedFileId` への参照。どちらか一方）
  - `minutes` 議事録作成者及び署名者の指名（時刻・担当者は他の行と共通。議事録作成者1名＋署名者複数を **`MEMBERS`（氏名のみのリスト）** から選択。＋/−で署名者を増減）。閲覧画面でも「時刻｜内容｜担当者」の3列に揃え、内容欄に「議事録作成者 【 氏名 】君 ／ 署名者 【 氏名 】君 …」を罫線なしで表示。複製時は氏名をクリアして枠だけ引き継ぐ
  - `attendance` 出席者及び定足数の確認（時刻・担当者は他の行と共通。出席義務数／定足数／出席数（当日記入）／オブザーバー数（当日記入）を入力）。閲覧画面は3列に揃え、内容欄に「出席義務数 【 13 】名中【 】名 ／ 定足数 【 11 】名 ／ オブザーバー 【 】名」。複製時は当日記入分（出席数・オブザーバー数）をクリア、義務数・定足数は引き継ぐ
  - `deadlines` 次回資料提出期限の確認（時刻・担当者は他の行と共通。次回会議ごとに 会議名／開催日／上程届け提出日／資料提出日 を入力、「＋ 会議を追加」で増やせる）。閲覧画面は3列に揃え、内容欄に「◯◯会議 開催日 3月17日 ／ 上程届け 3月12日 資料提出日 3月13日」を会議ぶん並べる。複製時は日付をクリア、会議名は枠として引き継ぐ
- **右＝ファイルパレット**：**2 タブ**。
  - 「上程済み議案一覧」：**上程済み（未配信）の議案のみ**。配信確定済み（locked）は次回以降の次第では出さない（既にこの次第に紐づいている場合のみ表示に残す）。ファイルリンク行へ**ドラッグ&ドロップ**／行選択＋**クリック**で紐づけ。「議案を開く ↗」は別タブ
  - 「固定ファイル一覧」：`useFixedFiles(sidai.yearId)` の年度フォルダ固定ファイル。ファイルリンク行を選択して**クリック**で紐づけ（`linkedFixedFileId`）。行チップの「開く ↗」は `openFileAsync` + `getFixedFileBlob`
  - 議案と固定ファイルは排他（一方を紐づけると他方は自動で `null`）。「解除」で外す。閲覧画面・配信データ画面でも固定ファイルチップを開ける（`SidaiDoc` の `fixedFileById` / `onOpenFixedFile` prop）
- **編集権限**：`can.createSidai` を持たないユーザーが `/sidai/[id]` に来ると `/sidai/[id]/view` へ `router.replace`（編集不可）。`/sidai` 一覧・閲覧画面の「編集」導線も `can.createSidai` で表示制御。
- **担当者**：`ASSIGNEES`（[`mockData.ts`](src/lib/mockData.ts) のダミーリスト）から `<select>` で選択
- **時刻・日時は半角**：行の「時刻」欄と左カラムの「日時」欄は入力時に [`format.toHalfWidth`](src/lib/format.ts) で全角数字・全角コロン（：）・全角ピリオド・全角スペースを半角へ正規化。閲覧画面・配信データ画面（`SidaiDoc`）も `row.time` / `sidai.datetime` を `toHalfWidth` して表示（既存の全角データもフォールバックで半角に）
- **複製**：一覧の「前回の次第を複製して作成」／編集画面トップバーの「この次第を複製して新規作成」。進行・見出し・空欄行はそのまま、時刻とファイルリンクはクリアして新規作成
- **確認（閲覧）**：`/sidai/[sidaiId]/view`（[`SidaiView.tsx`](src/components/SidaiView.tsx)）。ファイルリンク行の紐づけ議案は**別タブ**で開くリンク。トップバーに「ダウンロード」ボタン（次第を自己完結 HTML で保存）。印刷対応（描画は [`SidaiDoc.tsx`](src/components/SidaiDoc.tsx) を SidaiView と配信データ画面で共用、`linkGianTo` の遷移先はそれぞれ異なる）
- **配信確定**（[`src/lib/distributionStore.ts`](src/lib/distributionStore.ts)・LS キー `yuhitsu.distribution-store.v3`）：編集画面トップバーの「配信確定」→ ダイアログで **配信データ名称／会議体（理事会・三役会）／回の名称** を設定 → 確定すると、その時点の次第・紐づく上程済み議案（完全コピー）・資料メタ（`gianFiles`＝名前・サイズ、実体なし）を **配信パッケージ**としてコピー保存する
  - **収録した議案は完全ロック**（`lockGian()` で状態を「配信確定」へ・`reason:"配信確定"` のスナップショットを取得・本文/資料を読み取り専用に）
  - **次第はロックしない**：当日記入する箇所（出席者数・オブザーバー数など）があるため、確定後も次第は編集を継続できる。編集画面には「配信確定済み（当日記入分は編集可）」のお知らせ帯と、トップバーに「配信確定済み vN ↗」チップ＋「再配信確定」ボタンを表示
  - 同じ会議体・回に既存があれば版数を自動で +1。差し替えが必要なら「再配信確定」で新しい版（v2, v3 …）を作成
- **配信データ画面**：**凍結された次第のみ**を表示（「収録議案」一覧は廃止）。次第内の議案名リンクから**別タブ**で `/haishin/[distId]/gian/[gianId]`（[`FrozenGianView.tsx`](src/components/FrozenGianView.tsx)）＝確定時点の議案コピー＋資料（`frozenFiles`。名前クリックで確定時点のファイルを開ける＝`distFilesDb`）を開く。`FrozenGianView` はマウントガードで初回レンダリングの「見つかりません」表示のちらつきを防ぐ
- **配信データのダウンロード**：トップバーの「ダウンロード」ボタン（[`DistributionView.tsx`](src/components/DistributionView.tsx)）で、**次第を先頭に、収録議案（確定時点の凍結コピー）を後ろに連結**した単一 HTML を保存（「次第がトップになる」）。議案は画面上は `display:none` の `[data-export-show]` ブロックに `<GianView embedded>` で描画しておき、[`downloadDocHtml`](src/lib/download.ts) がクローン時に表示へ戻し、`[data-export-gian]` ごとに改ページ（`break-before:page`）
- **配信確定と資料の凍結**（[`finalizeDistribution`](src/lib/distributionStore.ts)・**async**）：`gianFilesDb` の各資料 Blob を `distFilesDb.putDistFile()` で配信データ専用ストアへコピーし、`pkg.gianFiles` の `id` はコピー先（`df-…`）の id にする。元の議案資料が後から差し替え・削除されても配信データ側は確定時点のファイルを保持。基本方針の凍結コピーからは `priorFeedback` を除外。distribution-store LS キー **v3→v4**。

## 同期ラボ（`/sync-lab`・実験）

オフライン編集と同期を **クラウドなし** で試す実験ページ（マスターのみ・上部バー「同期ラボ」から）。本番の次第データには一切影響しない別モジュール。

- **CRDT**：[Yjs](https://github.com/yjs/yjs)（`Y.Doc` ＋ `Y.Array<Y.Map>` で「次第の行」を表現）
- **伝送路**：`BroadcastChannel`（同一ブラウザの別タブ間。サーバー不要）。[`src/lib/syncLab.ts`](src/lib/syncLab.ts) が手書きの薄い transport で `update` / 全状態 `state` / `hello` を流す
- **永続化**：`y-indexeddb`（DB `yuhitsu-synclab-v1`。タブを閉じても復元）
- **「切断／再接続」トグル**：切断中は送受信を止めてローカルに溜め、未送信件数を表示。再接続時に全状態を双方向で交換して**決定論的にマージ**
- 試し方：`/sync-lab` を 2 タブで開く → 両方で行を追加・編集（即時反映）→ 片方を切断して別々に編集 → 再接続でマージ（同じ行でも `time`/`title`/`assignee` は**フィールド単位でマージ**、削除・並べ替えも破綻しない）
- 検証済み：2 タブが同一状態へ収束／オフライン中の複数編集が再接続で反映／リロードで IndexedDB から復元
- リセット：ページの「実験データを初期化」ボタン、または `indexedDB.deleteDatabase("yuhitsu-synclab-v1")`

### 「サーバーに乗せるならオンラインでページを開いておく必要があるのでは？」

- **初回だけ**ネットワークが要る（アプリの HTML/JS/CSS を取得）。以降は **PWA / Service Worker** でアプリ本体をブラウザにキャッシュすれば、**オフラインでもページごと起動できる**。
- データはもともと端末内（IndexedDB / localStorage）。オフライン中の編集はローカルに溜まり、オンライン復帰時にまとめて同期（`/sync-lab` の「切断／再接続」がこの挙動の縮小版）。
- つまりサーバーの役割は「①アプリ資材を **1 回**配る（あとはキャッシュ）」「②オンライン時の同期ハブ＋認証＋恒久保存」。常時接続は不要。
- 今回の「ダウンロード」ボタンは、その **簡易版オフラインパック**（1 議案 / 1 次第 / 1 配信データを単一 HTML で持ち出し）。Service Worker 導入は[未実装（今後）](#未実装今後)。

## 未実装（今後）

- 実データ接続（Supabase / 認証 / ストレージ）… 現在は `localStorage`
- 実メール送信・パスワードリセットトークン・パスワードのハッシュ化
- 権限マトリクスの詳細設計（`/roles` でロール×操作をチェック編集できるが、強制範囲は主要ボタンのみ。議案編集ロックや年度作成などは未対応）
- 年度フォルダの新規作成 UI（現在は 3 年度で固定）／委員会の削除 UI（追加・名称変更は `editCommittees` で対応済み）
- 承認フローの本実装（配信データ作成者ロールによる承認・差し戻し）
- CRDT 同時編集（Yjs）を本番の次第・議案へ適用（現状は `/sync-lab` で概念実証のみ）
- **PWA / Service Worker**（アプリ本体をキャッシュして完全オフライン起動）・本格的なオフラインパック（現状は単一 HTML ダウンロードのみ）
- 議案本文へのファイルパレット D&D 挿入、本文中リンクのサムネイル常時表示
- 次第の並び順に沿った配信データ生成、番号プレフィックスによる一括差し替え
- 配信パッケージへの資料実体（Blob）のコピー（現状は名前・サイズの記録のみ）
- 決算議案の「結果・実績」欄の自動追加（要件定義書 3.3）
