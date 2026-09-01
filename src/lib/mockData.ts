// ─────────────────────────────────────────────────────────────
// プロトタイプ用モックデータ
// 外部接続（Supabase 等）は行わず、この配列だけで画面を動かす。
//
// テンプレート項目は実際の議案フォーマット
// 「4月度例会の件.docx（小牧青年会議所 3月度定例理事会提案議題）」から
// 全項目を洗い出して再現している。
// ─────────────────────────────────────────────────────────────

export type GianStatus = "editing" | "submitted" | "locked";
export type GianKind =
  | "協議"
  | "審議"
  | "決算協議"
  | "決算審議"
  | "基本方針";

/** 事業要綱 / 事業概要の 1 項目（テンプレートで定義された枠。番号とラベルは固定） */
export interface TemplateItem {
  /** 項目番号（テンプレート由来） */
  no: number;
  /** 表示ラベル */
  label: string;
  /** 記入内容（議案作成者が肉付けする部分） */
  body: string;
  /**
   * 基本方針の「事業計画」項目から別の議案へのリンク（任意）。
   * 基本方針以外の議案では未使用。
   */
  linkedGianId?: string;
}

/** 議案上程スケジュール表の 1 行 */
export interface ScheduleRow {
  /** 回数（例：1月度） */
  round: string;
  /** 上程会議名（例：定例三役会 / 定例理事会） */
  meeting: string;
  /** 会議開催日時 */
  date: string;
  /** 上程形式（協議 / 審議 / 協議・審議） */
  format: string;
}

/** 事業概要「実施までのスケジュール」の 1 行（日付欄と内容欄を分けて持つ） */
export interface ScheduleEntry {
  id: string;
  /** 日付（例：2026年1月9日 / 2026年2月 のように月のみも可） */
  date: string;
  /** 内容 */
  content: string;
}

/** 前回までの流れ：1 つの意見と、それへの対応（意見N／対応N のペア） */
export interface FeedbackExchange {
  id: string;
  opinion: string;
  response: string;
}

/** 前回までの流れ：1 つの会議（回）ぶんの意見と対応のまとまり */
export interface FeedbackRound {
  id: string;
  /** 会議名（例：第1回理事三役会） */
  meetingName: string;
  /** 開催日（例：2025年12月23日） */
  date: string;
  /** 形式（協議 / 審議 / 協議・審議） */
  format: string;
  /** 意見1／対応1、意見2／対応2 … のペア列 */
  exchanges: FeedbackExchange[];
}

/**
 * 審議対象資料・参考資料の 1 件。
 * リンク状態（リンク済み / 未リンク）はデータとして持たず、
 * 本文テキストに資料番号（審N・参N）が含まれるかで自動判定する（GianBuilder 側）。
 */
export interface ResourceItem {
  id: string;
  /** 連番（削除時は自動で繰り上げ） */
  n: number;
  name: string;
}

/** 基本方針：配属メンバー（役職＋氏名）。提案議題ブロックの代わりに置く */
export interface AssignedMember {
  id: string;
  /** 役職（例：事務局長／担当副理事長 兼 専務理事／次長／委員） */
  role: string;
  /** 氏名（複数名の場合はスペース区切りで自由記入） */
  name: string;
}

/** 委員会予算の 1 行（収入の部 / 支出の部） */
export interface BudgetLine {
  id: string;
  /** 科目名（例：事業費繰入収入／○月度例会） */
  label: string;
  /** 金額（自由記入。例：￥240,000-） */
  amount: string;
}

/** 委員会予算（収入の部・支出の部） */
export interface CommitteeBudget {
  income: BudgetLine[];
  expense: BudgetLine[];
}

export interface Gian {
  id: string;
  committee: string;
  kind: GianKind;
  status: GianStatus;

  // ── ヘッダー（提案議題ブロック）──
  /** 発行元 LOM 名 */
  lomName: string;
  /** 上程先の会議名（例：3月度定例理事会） */
  submissionMeeting: string;
  /** 提案議題 */
  topic: string;
  /** 提案区分（例：審議事項 / 協議事項） */
  proposalType: string;
  /** 提案日 */
  proposalDate: string;
  /** 提案者の役職（例：青少年育成委員会　委員長） */
  proposerRole: string;
  /** 提案者氏名 */
  proposerName: string;
  /** 文書作成者 */
  author: string;
  /** 作成日時 */
  createdAt: string;
  /** 礼状の発送 */
  courtesyLetter: string;
  /** メディア依頼書 */
  mediaRequest: string;
  /** 議案上程スケジュール */
  submissionSchedule: ScheduleRow[];
  /** 担当副理事長 確認日 */
  vpConfirmDate: string;

  // ── 本文 ──
  /** 前回までの流れ（意見と対応）。会議（回）ごとにまとめる */
  priorFeedback: FeedbackRound[];
  /** 事業要綱（1〜6） */
  outline: TemplateItem[];
  /** 事業概要（1〜9）。6.「実施までのスケジュール」は本文ではなく implementationSchedule で管理 */
  overview: TemplateItem[];
  /** 事業概要 6.「実施までのスケジュール」：日付欄と内容欄を分けた表 */
  implementationSchedule: ScheduleEntry[];

  // ── 基本方針（"基本方針" 種別のみ使用）──
  /** 配属メンバー（提案議題ブロックの代わり） */
  assignedMembers?: AssignedMember[];
  /** 委員会予算（収入の部・支出の部）。事業予定の次に表示 */
  committeeBudget?: CommitteeBudget;

  // ── 資料 ──
  reviewResources: ResourceItem[];
  referenceResources: ResourceItem[];
}

/** 事業要綱のテンプレート枠（初期ラベル。/templates で編集可） */
export const OUTLINE_LABELS = [
  "事業名称",
  "事業実施に至る背景",
  "事業の対象者",
  "事業目的",
  "検証の指標",
  "目的達成によって期待される効果",
];

/** 事業概要のテンプレート枠（初期ラベル。/templates で編集可） */
export const OVERVIEW_LABELS = [
  "実施日時",
  "実施場所",
  "予算総額",
  "参加員数計画並びに参加推進方法",
  "実施組織",
  "実施までのスケジュール",
  "実施内容",
  "前年度よりの引き継ぎ内容",
  "その他",
];

/**
 * 基本方針の「基本方針（本文）」枠（初期ラベル。/templates で編集可）。
 * サンプル『事務局基本方針vr1.docx』に準拠。
 */
export const KIHON_OUTLINE_LABELS = ["基本方針"];

/**
 * 基本方針の「事業計画」枠（初期ラベル。/templates で編集可）。
 * 各項目から個別の議案へリンクを張れる（`TemplateItem.linkedGianId`）。
 */
export const KIHON_OVERVIEW_LABELS = [
  "総会の運営について",
  "各種広報・ホームページの運営管理について",
  "会費の徴収及び財務管理について",
  "JOYBOX基金の積立について",
];

function buildItems(labels: string[], bodies: string[]): TemplateItem[] {
  return labels.map((label, i) => ({
    no: i + 1,
    label,
    body: bodies[i] ?? "",
  }));
}

function scheduleEntries(rows: [string, string][]): ScheduleEntry[] {
  return rows.map(([date, content], i) => ({ id: `sch${i + 1}`, date, content }));
}

function reviewList(names: string[]): ResourceItem[] {
  return names.map((name, i) => ({ id: `r${i + 1}`, n: i + 1, name }));
}

function refList(names: string[]): ResourceItem[] {
  return names.map((name, i) => ({ id: `p${i + 1}`, n: i + 1, name }));
}

// ── gian-001：実際の議案フォーマットをそのまま再現 ──
const gian001: Gian = {
  id: "gian-001",
  committee: "青少年育成委員会",
  kind: "審議",
  status: "editing",
  lomName: "一般社団法人小牧青年会議所",
  submissionMeeting: "3月度定例理事会",
  topic: "4月度例会～新時代スポーツフェスティバルinパークアリーナ小牧～",
  proposalType: "審議事項",
  proposalDate: "2026年03月03日（火）",
  proposerRole: "青少年育成委員会　委員長",
  proposerName: "筒井　健太郎",
  author: "筒井　健太郎",
  createdAt: "2026年02月28日",
  courtesyLetter: "なし",
  mediaRequest: "なし",
  submissionSchedule: [
    { round: "1月度", meeting: "定例三役会", date: "2025年12月16日", format: "協議" },
    { round: "1月度", meeting: "定例理事会", date: "2026年01月06日", format: "協議" },
    { round: "2月度", meeting: "定例三役会", date: "2026年01月21日", format: "協議" },
    { round: "2月度", meeting: "定例理事会", date: "2026年02月03日", format: "協議" },
    { round: "3月度", meeting: "定例三役会", date: "2026年02月17日", format: "協議・審議" },
    { round: "3月度", meeting: "定例理事会", date: "2026年03月03日", format: "協議・審議" },
  ],
  vpConfirmDate: "2026年02月28日",
  priorFeedback: [
    {
      id: "fr1",
      meetingName: "第1回理事三役会",
      date: "2025年12月23日",
      format: "協議",
      exchanges: [
        {
          id: "fr1-1",
          opinion:
            "2021年に貝沼委員長が子どもの夢について調査しているので、参考にしてみてください。",
          response: "確認して、参考にしてみます。",
        },
        {
          id: "fr1-2",
          opinion: "子どもはどうやって動くのか。",
          response: "基本的には自由に動いてもらいます。",
        },
        {
          id: "fr1-3",
          opinion:
            "スポーツをやって終わりではなく、学び、可能性を広げて欲しい。夢をテーマにするのであれば、小牧出身のスポーツ選手に協力してもらってはどうか？",
          response:
            "それを含め検討中です。終わった後に、自分が興味、関心を持ってもらうのも本例会のテーマです。",
        },
        {
          id: "fr1-4",
          opinion: "サッカー、バスケ、野球は学校で体験できるのではないですか。",
          response:
            "ストラックアウトなどは、学校ではできないと思いますが、まずは簡単に体験できる内容を考えています。",
        },
        {
          id: "fr1-5",
          opinion: "どうやって表彰をやりますか。",
          response: "競技ごとに集計をして、口頭で発表する予定です。",
        },
        {
          id: "fr1-6",
          opinion: "ブラインドサッカーの議案を参考にしてみてください。",
          response:
            "ただドリブルをするのではなく、ブラインドサッカーの体験もしたいと思います。",
        },
      ],
    },
    {
      id: "fr2",
      meetingName: "1月度定例理事会",
      date: "2026年01月06日",
      format: "協議",
      exchanges: [
        {
          id: "fr2-1",
          opinion:
            "意見が多くありますが、委員会メンバーでどのような意見がありますか。",
          response: "球技内容、チラシの件について話し合いを行いました。",
        },
        {
          id: "fr2-2",
          opinion: "参加者を集める具体的な手段は。",
          response:
            "学校での配布に加え、対象者と会える場所（校門前・児童館等）で許可を得て直接配布します。",
        },
      ],
    },
    {
      id: "fr3",
      meetingName: "2月度定例理事会",
      date: "2026年02月03日",
      format: "協議",
      exchanges: [
        {
          id: "fr3-1",
          opinion: "予算の備品費が過大に見える。相見積もりの根拠を示すこと。",
          response:
            "3社から見積もりを取得し、最安値で再計上（総額 ￥160,038）。内訳を事業収支予算書に添付。",
        },
        {
          id: "fr3-2",
          opinion: "雨天時・怪我人発生時の対応を明記すること。",
          response:
            "屋内会場のため実施可。救護体制と駐車場誘導動線を運営資料に追記中。",
        },
      ],
    },
  ],
  outline: buildItems(OUTLINE_LABELS, [
    "4月度例会～新時代スポーツフェスティバルinパークアリーナ小牧～",
    "子どもたちを取り巻く環境が変化する中で、学校や家庭以外で新しいことに挑戦する機会が十分に得られない場合もあります。子どもたちが自らの可能性を広げるためには、実際に体を動かし、仲間と関わり、新しいことに挑戦する「リアルな体験」を通じて、自分の楽しさや得意に気づく機会が重要です。\nそこで当委員会では、学校や家庭の枠を超えた新しい体験の場を提供し、将来の選択肢や可能性を広げるきっかけとなる例会を開催します。",
    "対外）小学生新1〜6年生　100名\n対内）（一社）小牧青年会議所メンバー39名　+ 新入会員10名＋外部監事１名",
    "対外）自分の可能性を広げるきっかけを作る。\n対内）子どもたちの感性を知る。",
    "対外）閉会式の発表にてポジティブな意見が80％\n対内）アンケート結果の設問1について、よく知ることができた、ある程度知ることができた、80％",
    "対外）子どもたちの将来の選択肢が増える。\n対内）子どもたちを導く指針を見つけられる。",
  ]),
  overview: buildItems(OVERVIEW_LABELS, [
    "2026年4月19日（日曜日）　12：00〜18：22",
    "パークアリーナ小牧　メインアリーナ",
    "￥160,038-",
    "対外）チラシ配布（手配り）\n対内）（一社）小牧青年会議所メンバー36名＋新入会員13名＋外部監事1名\n　　　各委員会へ電話案内・案内文の配信",
    "青少年育成委員会",
    "", // 6. 実施までのスケジュール → implementationSchedule で管理
    "【内容・所要時間】『新時代フェスティバルinパークアリーナ小牧』\n特別な経験や運動能力を問わず、誰でも参加しやすいニュースポーツから、特性の異なる4種目を行います。\n狙い：多様な競技を組み合わせることで、様々な側面から、自分にもできたという成功体験を創出し、子ども達が可能性を広げるきっかけとします。\n4種目：サッカーテニス、インディアカ、コーンホール、フラッグフットボール\n\n1部制にして、1〜4年生グループ、5〜6年生グループに分けます。\n1〜4年生グループ（10名×5グループ）／5〜6年生グループ（10名×5グループ）\nチームごとに種目を回り、競技後半はフラッグフットボールをメイン種目としてチーム全員が参加します。\n競技終了後にチームで感想を話し合い、振り返りを行います。チームごとに得点を出し、閉会式で発表します。\n\n※詳細なタイムスケジュール（開会式〜第4競技〜閉会式）は参考資料「タイムスケジュール」を参照。",
    "2018年6月度例会　学ぼう思いやりの心「JCブラインドサッカー」より\n・参加者を必要人数集める為には、小学校の先生にチラシの配布をお願いするだけではなく、対象者と会える場所（校門前での手渡し、ショッピングセンター、児童館）の配布先に許可を得た上で直接配布を行ってください。\n・チラシを先生にお渡しする際は例会の趣旨目的が分かる一文を添え、子供たちに配る前に読み上げていただいてから配布していただけるようお願いをして下さい。\n・サイドパネルとしてプラスチック段ボールを使用する時は、中に骨組みを入れボールが当たっても壊れないようにして下さい。\n・タッカーなど打った跡に養生テープなどで床に落ちないよう工夫をして下さい。\n・青年会議所メンバーに対して事前に説明会を行い、例会内容・目的・役割を伝え、協力していただけるよう準備をして下さい。",
    "なし",
  ]),
  implementationSchedule: scheduleEntries([
    ["2026年1月9日", "パークアリーナ挨拶"],
    ["2026年1月16日", "小牧市スポーツ課挨拶、打ち合わせ"],
    ["2026年1月31日", "小牧市スポーツ課打ち合わせ"],
    ["2026年2月", "後援依頼・参加者募集　審議"],
    ["2026年2月13日", "後援依頼を行う"],
    ["2026年2月20日", "小牧市学校教育課挨拶"],
    ["2026年2月25日", "校長会三役会"],
    ["2026年3月04日", "校長会"],
    ["2026年3月", "チラシ配布"],
    ["2026年3月", "本体審議"],
    ["2026年4月", "リハーサル"],
    ["2026年4月19日", "事業当日"],
  ]),
  reviewResources: reviewList([
    "事業収支予算書",
    "式次第",
    "案内文",
    "セレモニー配置図",
    "会場配置図",
    "会場選定理由",
    "種目選定理由",
    "看板デザイン",
    "応募フォーム",
    "受付用参加者名簿",
    "メンバー用参加者名簿",
    "運営資料",
    "メンバー用アンケート",
  ]),
  referenceResources: refList([
    "備品リスト",
    "シナリオ",
    "委員会フロー",
    "メンバー役割",
    "子どもの夢集計レポート",
    "フラッグフットボール",
    "インディアカ",
    "コーンホール",
    "サッカーテニス",
    "タイムスケジュール",
    "文化・スポーツ課備忘録パークアリーナの件",
    "スポーツ課備忘録",
    "パークアリーナ予約申込書",
  ]),
};

// ── gian-002：協議議案（記入途中） ──
const gian002: Gian = {
  id: "gian-002",
  committee: "渉外委員会",
  kind: "協議",
  status: "editing",
  lomName: "一般社団法人小牧青年会議所",
  submissionMeeting: "3月度定例理事会",
  topic: "9月度例会について（第1回協議）",
  proposalType: "協議事項",
  proposalDate: "2026年03月03日（火）",
  proposerRole: "渉外委員会　委員長",
  proposerName: "山田　由紀",
  author: "山田　由紀",
  createdAt: "2026年02月20日",
  courtesyLetter: "未定",
  mediaRequest: "未定",
  submissionSchedule: [
    { round: "3月度", meeting: "定例三役会", date: "2026年02月17日", format: "協議" },
    { round: "3月度", meeting: "定例理事会", date: "2026年03月03日", format: "協議" },
  ],
  vpConfirmDate: "",
  priorFeedback: [],
  outline: buildItems(OUTLINE_LABELS, [
    "9月度例会（仮）",
    "（記入中）",
    "",
    "",
    "",
    "",
  ]),
  overview: buildItems(OVERVIEW_LABELS, ["", "", "", "", "", "", "", "", ""]),
  implementationSchedule: scheduleEntries([["", ""]]),
  reviewResources: reviewList(["事業計画書", "スケジュール案"]),
  referenceResources: [],
};

// ── gian-003：決算議案（上程済み） ──
const gian003: Gian = {
  id: "gian-003",
  committee: "まちづくり委員会",
  kind: "決算協議",
  status: "submitted",
  lomName: "一般社団法人小牧青年会議所",
  submissionMeeting: "3月度定例理事会",
  topic: "2月度例会～商店街活性化フォーラム～（決算）",
  proposalType: "協議事項",
  proposalDate: "2026年03月03日（火）",
  proposerRole: "まちづくり委員会　委員長",
  proposerName: "佐藤　拓真",
  author: "佐藤　拓真",
  createdAt: "2026年03月01日",
  courtesyLetter: "発送済み（2/25）",
  mediaRequest: "なし",
  submissionSchedule: [
    { round: "3月度", meeting: "定例三役会", date: "2026年02月17日", format: "審議" },
    { round: "3月度", meeting: "定例理事会", date: "2026年03月03日", format: "審議" },
  ],
  vpConfirmDate: "2026年02月27日",
  priorFeedback: [
    {
      id: "fr1",
      meetingName: "1月度定例理事会",
      date: "2026年01月06日",
      format: "協議",
      exchanges: [
        {
          id: "fr1-1",
          opinion: "決算額が予算比 +2万円。差異理由を説明のこと。",
          response: "会場延長料金の発生を精算書に記載。予備費から充当済み。",
        },
        {
          id: "fr1-2",
          opinion: "アンケート回収率が低い。次年度への引き継ぎに反映を。",
          response:
            "回収率と改善案を実施報告書の「前年度よりの引き継ぎ内容」に記載。",
        },
      ],
    },
  ],
  outline: buildItems(OUTLINE_LABELS, [
    "2月度例会～商店街活性化フォーラム～",
    "商店街の来訪者数が5年連続で減少している。",
    "対外）商店街事業者・来場者 200名",
    "商店街と市民の接点を再構築する。",
    "来場者アンケートの満足度 80% 以上",
    "翌年度の継続事業化。",
  ]),
  overview: buildItems(OVERVIEW_LABELS, [
    "2026年2月15日（日）　13：00〜16：00",
    "小牧市中央商店街 アーケード広場",
    "￥240,000-（決算額）",
    "対外）SNS告知・商店街チラシ／対内）メンバー30名",
    "まちづくり委員会",
    "", // 6. 実施までのスケジュール → implementationSchedule で管理
    "商店主によるパネルディスカッション、来場者ワークショップ、地元高校生の発表。",
    "特になし（新規事業）",
    "なし",
  ]),
  implementationSchedule: scheduleEntries([
    ["2026年1月", "会場調整・出展者打診"],
    ["2026年2月上旬", "出展者確定"],
    ["2026年2月15日", "本番"],
  ]),
  reviewResources: reviewList(["事業収支決算書", "実施報告書", "精算書"]),
  referenceResources: refList(["当日配布資料", "アンケート集計"]),
};

// ── 過年度（2026年度）用の軽量ダミー議案 ──
// 年度タブ切り替えで委員会・議案一覧が変わることの確認用。中身は最小限。
function lightGian(
  id: string,
  committee: string,
  kind: GianKind,
  status: GianStatus,
  topic: string,
  proposerRole: string,
  proposerName: string
): Gian {
  return {
    id,
    committee,
    kind,
    status,
    lomName: "一般社団法人小牧青年会議所",
    submissionMeeting: "2026年 定例理事会",
    topic,
    proposalType: kind.includes("協議") ? "協議事項" : "審議事項",
    proposalDate: "2026年05月12日（火）",
    proposerRole,
    proposerName,
    author: proposerName,
    createdAt: "2026年05月01日",
    courtesyLetter: "なし",
    mediaRequest: "なし",
    submissionSchedule: [
      { round: "5月度", meeting: "定例三役会", date: "2026年04月21日", format: "協議" },
      { round: "5月度", meeting: "定例理事会", date: "2026年05月12日", format: "協議" },
    ],
    vpConfirmDate: "",
    priorFeedback: [],
    outline: buildItems(OUTLINE_LABELS, [topic, "", "", "", "", ""]),
    overview: buildItems(OVERVIEW_LABELS, ["", "", "", "", "", "", "", "", ""]),
    implementationSchedule: scheduleEntries([["", ""]]),
    reviewResources: reviewList(["事業計画書"]),
    referenceResources: [],
  };
}

const gian2026a = lightGian(
  "gian-2026a",
  "青少年育成委員会",
  "審議",
  "editing",
  "夏休みこども防災キャンプの件",
  "青少年育成委員会　委員長",
  "佐藤　拓真"
);

const gian2026b = lightGian(
  "gian-2026b",
  "総務委員会",
  "協議",
  "submitted",
  "定款一部変更について（第2回協議）",
  "総務委員会　委員長",
  "加藤　一樹"
);

// ── gian-004：基本方針（事務局事業計画・記入途中）──
// サンプル『事務局基本方針vr1.docx』に準拠。事業計画の各項目から個別議案へリンク。
const gian004: Gian = {
  id: "gian-004",
  committee: "会員拡大委員会",
  kind: "基本方針",
  status: "editing",
  lomName: "一般社団法人小牧青年会議所",
  submissionMeeting: "1月度定例理事会",
  topic: "事務局事業計画（案）",
  proposalType: "基本方針",
  proposalDate: "2026年01月06日（火）",
  proposerRole: "事務局長",
  proposerName: "丸川　翼",
  author: "丸川　翼",
  createdAt: "2025年12月15日",
  courtesyLetter: "なし",
  mediaRequest: "なし",
  submissionSchedule: [],
  vpConfirmDate: "2025年12月10日",
  priorFeedback: [
    {
      id: "kf1",
      meetingName: "予定者会議",
      date: "2025年11月25日",
      format: "協議",
      exchanges: [
        {
          id: "kf1-1",
          opinion: "広報の年間計画を事業計画に明記してほしい。",
          response: "「各種広報・ホームページの運営管理について」に年間計画を追記。",
        },
      ],
    },
  ],
  outline: [
    {
      no: 1,
      label: "基本方針",
      body: "（一社）小牧青年会議所は、創立55年の節目を迎えました。歴史と伝統を築かれた先輩諸兄姉に深甚なる敬意を表し、その志を次代へと受け継ぐことは、我々現役会員の責務です。\n本年度、事務局は「不易流行」をテーマに、会員が安心して挑戦できる環境を整備するとともに、未来へつながる組織体制を構築します。さらに広報を通じて地域に希望と笑顔を届け、我々の運動の価値を高めてまいります。",
    },
  ],
  overview: [
    { no: 1, label: "総会の運営について", body: "", linkedGianId: "gian-002" },
    { no: 2, label: "各種広報・ホームページの運営管理について", body: "" },
    { no: 3, label: "会費の徴収及び財務管理について", body: "" },
    { no: 4, label: "JOYBOX基金の積立について", body: "" },
  ],
  implementationSchedule: scheduleEntries([
    ["1月", "通常総会"],
    ["8月", "臨時総会"],
    ["12月", "臨時総会"],
  ]),
  assignedMembers: [
    { id: "am1", role: "事務局長", name: "丸川　翼" },
    { id: "am2", role: "担当副理事長 兼 専務理事", name: "水落　太貴" },
    { id: "am3", role: "次長", name: "白木　大智" },
    { id: "am4", role: "委員", name: "鎧塚　章平　小池　公二" },
  ],
  committeeBudget: {
    income: [
      { id: "bi1", label: "事業費繰入収入", amount: "￥1,200,000-" },
      { id: "bi2", label: "会費収入", amount: "￥600,000-" },
    ],
    expense: [
      { id: "be1", label: "1月度 通常総会", amount: "￥250,000-" },
      { id: "be2", label: "広報・ホームページ運営費", amount: "￥180,000-" },
      { id: "be3", label: "JOYBOX基金積立", amount: "￥120,000-" },
    ],
  },
  reviewResources: [],
  referenceResources: [],
};

export const MOCK_GIANS: Gian[] = [
  gian001,
  gian002,
  gian003,
  gian004,
  gian2026a,
  gian2026b,
];

export function getGian(id: string): Gian | undefined {
  return MOCK_GIANS.find((g) => g.id === id);
}

export const STATUS_LABEL: Record<GianStatus, string> = {
  editing: "編集中",
  submitted: "上程済み",
  locked: "配信確定",
};

/**
 * 担当者の事前登録リスト（次第作成で選択）。
 * プロトタイプ用のダミー。役職＋氏名で登録し、手入力の表記ゆれを防ぐ想定（要件定義書 3.6.1）。
 */
export const ASSIGNEES: string[] = [
  "理事長 梅澤 侑未",
  "直前理事長 加藤 一樹",
  "専務理事 水落 太貴",
  "副理事長 佐藤 拓真",
  "副理事長 丹羽 智子",
  "事務局長 丸川 翼",
  "監事 名和 俊",
  "議長",
  "青少年育成委員会 委員長 筒井 健太郎",
  "渉外委員会 委員長 山田 由紀",
  "まちづくり委員会 委員長 佐藤 拓真",
  "会員拡大委員会 委員長 鈴木 花子",
  "55周年特別委員会 委員長 高橋 誠",
];

/**
 * メンバー氏名リスト（議事録作成者・署名者の指名で選択）。
 * こちらは役職を付けず氏名のみ。プロトタイプ用のダミー。
 */
export const MEMBERS: string[] = [
  "梅澤 侑未",
  "加藤 一樹",
  "水落 太貴",
  "佐藤 拓真",
  "丹羽 智子",
  "丸川 翼",
  "名和 俊",
  "筒井 健太郎",
  "山田 由紀",
  "鈴木 花子",
  "高橋 誠",
  "貝沼 大輔",
  "石川 直樹",
  "森田 彩",
];
