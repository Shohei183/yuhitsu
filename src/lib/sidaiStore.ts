// ─────────────────────────────────────────────────────────────
// 次第（会議の進行表）ストア
//
// gianStore と同じく localStorage を保存先とする（外部接続なし）。
// - 次第の作成・複製・保存
// - 行の追加／並び替え／削除は画面側で rows を編集して saveSidai する
// ─────────────────────────────────────────────────────────────

import { Period } from "./yearStore";
import { sectionLabels } from "./templateStore";

const LS_KEY = "yuhitsu.sidai-store.v7"; // v6→v7: filelink 行に linkedFixedFileId を追加

/** 次第の行の種別（要件定義書 3.6） */
export type SidaiRowType =
  | "heading" // 区分の見出し（開会 / 協議事項 / 審議事項 など）
  | "progress" // 定型進行項目：担当者名のみが紐づく
  | "blank" // 空欄記入項目：その場で書き込む
  | "filelink" // ファイルリンク項目：上程済み議案・資料への参照
  | "minutes" // 議事録作成者及び署名者の指名
  | "attendance" // 出席者及び定足数の確認
  | "deadlines"; // 次回資料提出期限の確認

/** deadlines：次回会議1件ぶんの提出期限 */
export interface DeadlineEntry {
  id: string;
  /** 会議名（例：2026年4月定例三役会） */
  meeting: string;
  /** 会議開催日（例：3月17日） */
  meetingDate: string;
  /** 上程届け提出日 */
  noticeDate: string;
  /** 資料提出日 */
  docDate: string;
}

export interface SidaiRow {
  id: string;
  type: SidaiRowType;
  /** 時刻（任意。例：19:00） */
  time: string;
  /** 議題・項目名 */
  title: string;
  /** 担当者（役職＋氏名。事前登録リストから選択） */
  assignee: string;
  /** filelink：紐づく上程済み議案の gianId */
  linkedGianId: string | null;
  /** filelink：紐づく年度フォルダの固定ファイル id（議案の代わりに固定ファイルを参照する場合） */
  linkedFixedFileId?: string | null;
  /** blank：その場で記入する内容 */
  note: string;
  /** minutes：議事録作成者（1名） */
  recorder?: string;
  /** minutes：署名者（複数） */
  signers?: string[];
  /** attendance：出席義務数 */
  requiredCount?: string;
  /** attendance：出席数（当日記入） */
  presentCount?: string;
  /** attendance：定足数 */
  quorum?: string;
  /** attendance：オブザーバー数（当日記入） */
  observerCount?: string;
  /** deadlines：次回会議ごとの資料提出期限 */
  deadlineRows?: DeadlineEntry[];
}

export interface Sidai {
  id: string;
  /** 所属する年度フォルダ（yearStore の FiscalYear.id） */
  yearId: string;
  /** 予定者期間 / 本番期間 */
  period: Period;
  meetingName: string;
  datetime: string;
  place: string;
  chair: string;
  rows: SidaiRow[];
  createdAt: string;
  updatedAt: string;
  /**
   * 直近の配信確定で作成された配信データ package の id。
   * 配信確定しても次第自体はロックしない（当日記入分があるため）。
   */
  distributionId?: string;
}

export type SidaiStore = Record<string, Sidai>;

let seq = 0;
function newId(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

function clone<T>(v: T): T {
  return typeof structuredClone === "function"
    ? structuredClone(v)
    : (JSON.parse(JSON.stringify(v)) as T);
}

// ── 初期データ（mockup_sidai.html を元にした 2026年7月度定例理事会）──
const SEED_ID = "sidai-seed";

function seedSidai(): Sidai {
  const r = (
    type: SidaiRowType,
    title: string,
    time = "",
    assignee = ""
  ): Omit<SidaiRow, "id"> => ({
    type,
    title,
    time,
    assignee,
    linkedGianId: null,
    note: "",
  });

  const rows: Omit<SidaiRow, "id">[] = [
    r("heading", "開会"),
    r("progress", "開会の言葉", "19:00", "副理事長 丹羽 智子"),
    r("progress", "JCIクリード唱和", "19:01", "事務局長 丸川 翼"),
    r("progress", "理事長挨拶", "19:05", "理事長 梅澤 侑未"),
    r("progress", "議長の指名", "19:16", "理事長 梅澤 侑未"),
    {
      ...r("minutes", "議事録作成者及び署名者の指名", "19:17", "議長"),
      recorder: "丸川 翼",
      signers: ["佐藤 拓真", "丹羽 智子", "名和 俊"],
    },
    {
      ...r("attendance", "出席者及び定足数の確認", "19:18", "議長"),
      requiredCount: "13",
      presentCount: "",
      quorum: "11",
      observerCount: "",
    },
    r("progress", "前回議事録の承認", "19:19", "議長"),
    r("heading", "役員報告"),
    r("progress", "委員会報告", "19:20", "議長"),
    r("heading", "協議事項"),
    r("filelink", "9月度例会について", "19:22", "渉外委員会 委員長 山田 由紀"),
    r(
      "filelink",
      "10月度例会について",
      "20:00",
      "まちづくり委員会 委員長 佐藤 拓真"
    ),
    r("heading", "審議事項"),
    r(
      "filelink",
      "2月度例会決算の件",
      "21:31",
      "まちづくり委員会 委員長 佐藤 拓真"
    ),
    r("heading", "報告・閉会"),
    r("blank", "その他連絡事項", "21:56", ""),
    {
      ...r("deadlines", "次回資料提出期限の確認", "22:00", "議長"),
      deadlineRows: [
        {
          id: "dl-1",
          meeting: "2026年4月定例三役会",
          meetingDate: "3月17日",
          noticeDate: "3月12日",
          docDate: "3月13日",
        },
        {
          id: "dl-2",
          meeting: "2026年4月定例理事会",
          meetingDate: "4月7日",
          noticeDate: "4月2日",
          docDate: "4月3日",
        },
      ],
    },
    r("progress", "監事所見", "22:10", "監事 名和 俊"),
    r("progress", "閉会の言葉", "22:16", "直前理事長 加藤 一樹"),
  ];

  return {
    id: SEED_ID,
    yearId: "fy-2027",
    period: "live",
    meetingName: "2026年7月度定例理事会",
    datetime: "2026年7月7日（火）19:00〜22:16",
    place: "楽田ふれあいセンター2階 講義室",
    chair: "専務理事 水落 太貴",
    createdAt: "2026-06-20T00:00:00.000Z",
    updatedAt: "2026-06-20T00:00:00.000Z",
    rows: rows.map((row, i) => ({ ...row, id: `${SEED_ID}-r${i}` })),
  };
}

/** 最小構成の次第 seed（年度切替・期間切替の確認用） */
function miniSeed(
  id: string,
  yearId: string,
  period: Period,
  meetingName: string
): Sidai {
  const mk = (
    type: SidaiRowType,
    title: string,
    time = "",
    assignee = ""
  ): SidaiRow => ({
    id: `${id}-${title}`,
    type,
    title,
    time,
    assignee,
    linkedGianId: null,
    note: "",
  });
  return {
    id,
    yearId,
    period,
    meetingName,
    datetime: "",
    place: "",
    chair: "",
    createdAt: "2025-09-01T00:00:00.000Z",
    updatedAt: "2025-09-01T00:00:00.000Z",
    rows: [
      mk("heading", "開会"),
      mk("progress", "開会の言葉"),
      mk("heading", "協議事項"),
      mk("heading", "審議事項"),
      mk("heading", "報告・閉会"),
      mk("progress", "閉会の言葉"),
    ],
  };
}

function buildDefaults(): SidaiStore {
  return {
    [SEED_ID]: seedSidai(),
    "sidai-seed-2027p": miniSeed(
      "sidai-seed-2027p",
      "fy-2027",
      "planned",
      "2027年度 予定者 第1回三役会"
    ),
    "sidai-seed-2026": miniSeed(
      "sidai-seed-2026",
      "fy-2026",
      "live",
      "2026年5月度定例理事会"
    ),
  };
}

// ── キャッシュ ──
let cache: SidaiStore | null = null;
let defaultsCache: SidaiStore | null = null;

function loadDefaults(): SidaiStore {
  if (!defaultsCache) defaultsCache = buildDefaults();
  return defaultsCache;
}

function load(): SidaiStore {
  if (cache) return cache;
  if (typeof window === "undefined") {
    cache = loadDefaults();
    return cache;
  }
  const base = buildDefaults();
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (raw) {
      cache = { ...base, ...(JSON.parse(raw) as SidaiStore) };
      return cache;
    }
  } catch {
    /* 破損時は初期状態 */
  }
  cache = base;
  return cache;
}

const listeners = new Set<() => void>();

function commit(next: SidaiStore): void {
  cache = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(LS_KEY, JSON.stringify(next));
    } catch {
      /* 容量超過等は無視 */
    }
  }
  listeners.forEach((fn) => fn());
}

// ── 購読 ──
export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getStore(): SidaiStore {
  return load();
}
export function getStoreDefault(): SidaiStore {
  return loadDefaults();
}
export function getSidai(id: string): Sidai | undefined {
  return load()[id];
}
export function getSidaiDefault(id: string): Sidai | undefined {
  return loadDefaults()[id];
}

/** 更新日時の新しい順 */
export function listSidai(): Sidai[] {
  return Object.values(load()).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt)
  );
}

/** 指定した年度・期間の次第（更新日時の新しい順） */
export function listSidaiFor(yearId: string, period: Period): Sidai[] {
  return listSidai().filter((s) => s.yearId === yearId && s.period === period);
}

// ── 変更操作 ──

export function saveSidai(id: string, sidai: Sidai): void {
  const store = load();
  if (!store[id]) return;
  commit({
    ...store,
    [id]: { ...sidai, updatedAt: new Date().toISOString() },
  });
}

/**
 * 新規の空の次第を作成し、その id を返す。
 * 区分（見出し）の並びは、その年度の次第テンプレート（templateStore）を使う。
 */
export function createSidai(opts: { yearId: string; period: Period }): string {
  const now = new Date().toISOString();
  const id = newId("sidai");

  const row = (
    type: SidaiRowType,
    title: string
  ): SidaiRow => ({
    id: newId("row"),
    type,
    title,
    time: "",
    assignee: "",
    linkedGianId: null,
    note: "",
  });

  const sections = sectionLabels(opts.yearId).filter((s) => s.trim());
  const useSections = sections.length > 0 ? sections : ["開会", "閉会"];
  const rows: SidaiRow[] = [];
  useSections.forEach((label, i) => {
    rows.push(row("heading", label));
    if (i === 0) rows.push(row("progress", "開会の言葉"));
  });
  rows.push(row("progress", "閉会の言葉"));

  const sidai: Sidai = {
    id,
    yearId: opts.yearId,
    period: opts.period,
    meetingName: "（新規）定例理事会",
    datetime: "",
    place: "",
    chair: "",
    createdAt: now,
    updatedAt: now,
    rows,
  };
  commit({ ...load(), [id]: sidai });
  return id;
}

/**
 * 前回の次第を複製して今回用を作成する（定型項目部分の使い回しを想定）。
 * 進行・見出し・空欄行はそのまま、ファイルリンク行の議案紐づけと時刻・記入内容はクリアする。
 */
export function duplicateSidai(sourceId: string): string | null {
  const src = getSidai(sourceId);
  if (!src) return null;
  const now = new Date().toISOString();
  const id = newId("sidai");
  const copy: Sidai = {
    id,
    yearId: src.yearId,
    period: src.period,
    meetingName: `${src.meetingName}（複製）`,
    datetime: "",
    place: src.place,
    chair: src.chair,
    createdAt: now,
    updatedAt: now,
    rows: src.rows.map((row) => ({
      ...clone(row),
      id: newId("row"),
      time: "",
      linkedGianId: null,
      linkedFixedFileId: null,
      note: "",
      // 議事録作成者・署名者は会議ごとに指名し直すためクリア
      recorder: row.recorder !== undefined ? "" : undefined,
      signers: row.signers ? row.signers.map(() => "") : undefined,
      // 出席・オブザーバー数は当日記入なのでクリア（義務数・定足数は引き継ぐ）
      presentCount: row.presentCount !== undefined ? "" : undefined,
      observerCount: row.observerCount !== undefined ? "" : undefined,
      // 資料提出期限は次回会議ごとに変わるため日付をクリア（会議名は枠として引き継ぐ）
      deadlineRows: row.deadlineRows
        ? row.deadlineRows.map((d) => ({
            ...d,
            id: newId("dl"),
            meetingDate: "",
            noticeDate: "",
            docDate: "",
          }))
        : undefined,
    })),
  };
  commit({ ...load(), [id]: copy });
  return id;
}

export function deleteSidai(id: string): void {
  const store = { ...load() };
  delete store[id];
  commit(store);
}

/** 動作確認用：ストアを初期状態へ */
export function resetSidaiStore(): void {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(LS_KEY);
    } catch {
      /* noop */
    }
  }
  cache = null;
  commit(buildDefaults());
}
