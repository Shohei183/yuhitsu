// ─────────────────────────────────────────────────────────────
// 年度フォルダ / 組織構造ストア
//
// 要件定義書 3.8 / 3.10 / 3.11：
//  - 年度を最上位のデータ単位とする（メンバー管理を除く）。
//  - 年度フォルダ直下に「固定ファイル」「委員会」「メンバー権限」が 1 つずつ。
//  - 予定者期間（前年8〜12月）と本番期間（当年1〜12月）を内包し、
//    配信（理事会／三役会）は期間ごとに独立管理。
//  - ロールは「人 × 年度」ごと（同一人物でも年度で役職が異なる）。
//
// プロトタイプ: localStorage のみ。3 年度ぶんのダミーデータを投入。
// ─────────────────────────────────────────────────────────────

import { memberIdForName } from "./memberStore";

const LS_KEY = "yuhitsu.years.v5"; // v4→v5: 会員拡大委員会に基本方針議案 gian-004 を追加

/** 予定者期間 / 本番期間 */
export type Period = "planned" | "live";

export const PERIOD_LABEL: Record<Period, string> = {
  planned: "予定者期間",
  live: "本年度",
};

/**
 * ロール（仮）。JC の役職に対応。
 * `master` は LOM 管理者（アカウント属性）で、ロール割当の対象外・常に全許可。
 * 各ロールの操作権限は /roles でマスターが編集する（permissions.ts の DEFAULT_PERMS が既定）。
 */
export type Role =
  | "master" // マスター（LOM 管理者）
  | "president" // 理事長
  | "executive_director" // 専務
  | "vice_president" // 副理事長
  | "auditor" // 監事
  | "secretary_general" // 事務局長
  | "committee_chair" // 委員長
  | "committee_member" // 委員会メンバー
  | "director"; // 理事

export const ROLE_LABEL: Record<Role, string> = {
  master: "マスター",
  president: "理事長",
  executive_director: "専務",
  vice_president: "副理事長",
  auditor: "監事",
  secretary_general: "事務局長",
  committee_chair: "委員長",
  committee_member: "委員会メンバー",
  director: "理事",
};

/** メンバー権限の割当・デモ用ロール切替・/roles で扱うロール（master は除く） */
export const SELECTABLE_ROLES: Role[] = [
  "president",
  "executive_director",
  "vice_president",
  "auditor",
  "secretary_general",
  "committee_chair",
  "committee_member",
  "director",
];

export interface Committee {
  id: string;
  name: string;
  /** この年度・この委員会で構築中／上程済みの議案 id（mockData / gianStore を参照） */
  gianIds: string[];
}

export interface RoleAssignment {
  memberId: string;
  role: Role;
  /** committee_chair のとき、担当委員会 */
  committeeId?: string | null;
}

export interface FiscalYear {
  id: string;
  label: string;
  plannedPeriodLabel: string;
  livePeriodLabel: string;
  committees: Committee[];
  assignments: RoleAssignment[];
}

export type YearStore = Record<string, FiscalYear>;

// ── 初期データ ──────────────────────────────────────────────

const mid = memberIdForName; // 氏名 → メンバー id

function buildDefaults(): YearStore {
  // ── fy-2027（既存サンプルの年度）──
  const fy2027: FiscalYear = {
    id: "fy-2027",
    label: "2027年度",
    plannedPeriodLabel: "予定者期間（2026年8月〜12月）",
    livePeriodLabel: "本年度（2027年1月〜12月）",
    committees: [
      { id: "cm-2027-seishonen", name: "青少年育成委員会", gianIds: ["gian-001"] },
      { id: "cm-2027-shogai", name: "渉外委員会", gianIds: ["gian-002"] },
      { id: "cm-2027-machi", name: "まちづくり委員会", gianIds: ["gian-003"] },
      { id: "cm-2027-kakudai", name: "会員拡大委員会", gianIds: ["gian-004"] },
      { id: "cm-2027-55th", name: "55周年特別委員会", gianIds: [] },
    ],
    assignments: [
      { memberId: mid("梅澤 侑未"), role: "president" },
      { memberId: mid("水落 太貴"), role: "executive_director" },
      { memberId: mid("丸川 翼"), role: "secretary_general" },
      { memberId: mid("佐藤 拓真"), role: "vice_president" },
      { memberId: mid("丹羽 智子"), role: "vice_president" },
      { memberId: mid("名和 俊"), role: "auditor" },
      { memberId: mid("加藤 一樹"), role: "director" },
      { memberId: mid("貝沼 大輔"), role: "director" },
      {
        memberId: mid("筒井 健太郎"),
        role: "committee_chair",
        committeeId: "cm-2027-seishonen",
      },
      {
        memberId: mid("山田 由紀"),
        role: "committee_chair",
        committeeId: "cm-2027-shogai",
      },
      {
        memberId: mid("森田 彩"),
        role: "committee_chair",
        committeeId: "cm-2027-machi",
      },
      {
        memberId: mid("鈴木 花子"),
        role: "committee_chair",
        committeeId: "cm-2027-kakudai",
      },
      {
        memberId: mid("高橋 誠"),
        role: "committee_chair",
        committeeId: "cm-2027-55th",
      },
      { memberId: mid("石川 直樹"), role: "committee_member" },
    ],
  };

  // ── fy-2026（委員会構成・割当が 2027 と異なる。年度切替の確認用）──
  const fy2026: FiscalYear = {
    id: "fy-2026",
    label: "2026年度",
    plannedPeriodLabel: "予定者期間（2025年8月〜12月）",
    livePeriodLabel: "本年度（2026年1月〜12月）",
    committees: [
      { id: "cm-2026-seishonen", name: "青少年育成委員会", gianIds: ["gian-2026a"] },
      { id: "cm-2026-soumu", name: "総務委員会", gianIds: ["gian-2026b"] },
      { id: "cm-2026-koho", name: "広報委員会", gianIds: [] },
    ],
    assignments: [
      // 役職が年度で変わる例：
      //  梅澤 侑未 … 2027 理事長 → 2026 副理事長
      //  水落 太貴 … 2027 専務   → 2026 委員会メンバー
      //  筒井 健太郎 … 2027 委員長 → 2026 委員会メンバー
      { memberId: mid("名和 俊"), role: "executive_director" },
      { memberId: mid("丸川 翼"), role: "secretary_general" },
      { memberId: mid("梅澤 侑未"), role: "vice_president" },
      { memberId: mid("丹羽 智子"), role: "auditor" },
      { memberId: mid("高橋 誠"), role: "director" },
      { memberId: mid("山田 由紀"), role: "director" },
      {
        memberId: mid("加藤 一樹"),
        role: "committee_chair",
        committeeId: "cm-2026-soumu",
      },
      {
        memberId: mid("佐藤 拓真"),
        role: "committee_chair",
        committeeId: "cm-2026-seishonen",
      },
      {
        memberId: mid("森田 彩"),
        role: "committee_chair",
        committeeId: "cm-2026-koho",
      },
      { memberId: mid("筒井 健太郎"), role: "committee_member" },
      { memberId: mid("水落 太貴"), role: "committee_member" },
      { memberId: mid("鈴木 花子"), role: "committee_member" },
      { memberId: mid("貝沼 大輔"), role: "committee_member" },
      { memberId: mid("石川 直樹"), role: "committee_member" },
    ],
  };

  // ── fy-2028（予定者期間のみ稼働中。ほぼ空）──
  const fy2028: FiscalYear = {
    id: "fy-2028",
    label: "2028年度",
    plannedPeriodLabel: "予定者期間（2027年8月〜12月）",
    livePeriodLabel: "本年度（2028年1月〜12月）",
    committees: [
      { id: "cm-2028-a", name: "A委員会（仮）", gianIds: [] },
      { id: "cm-2028-b", name: "B委員会（仮）", gianIds: [] },
    ],
    assignments: [
      { memberId: mid("水落 太貴"), role: "executive_director" },
      {
        memberId: mid("石川 直樹"),
        role: "committee_chair",
        committeeId: "cm-2028-a",
      },
      {
        memberId: mid("森田 彩"),
        role: "committee_chair",
        committeeId: "cm-2028-b",
      },
    ],
  };

  return { "fy-2026": fy2026, "fy-2027": fy2027, "fy-2028": fy2028 };
}

/** 年度タブに出す順（新しい年度を右に） */
export const YEAR_ORDER = ["fy-2026", "fy-2027", "fy-2028"];

// ── キャッシュ ──
let cache: YearStore | null = null;
let defaultsCache: YearStore | null = null;

function loadDefaults(): YearStore {
  if (!defaultsCache) defaultsCache = buildDefaults();
  return defaultsCache;
}

function load(): YearStore {
  if (cache) return cache;
  if (typeof window === "undefined") {
    cache = loadDefaults();
    return cache;
  }
  const base = buildDefaults();
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (raw) {
      cache = { ...base, ...(JSON.parse(raw) as YearStore) };
      return cache;
    }
  } catch {
    /* 破損時は初期状態 */
  }
  cache = base;
  return cache;
}

const listeners = new Set<() => void>();

function commit(next: YearStore): void {
  cache = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(LS_KEY, JSON.stringify(next));
    } catch {
      /* noop */
    }
  }
  listeners.forEach((fn) => fn());
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getStore(): YearStore {
  return load();
}
export function getStoreDefault(): YearStore {
  return loadDefaults();
}
export function getYear(id: string): FiscalYear | undefined {
  return load()[id];
}
export function getYearDefault(id: string): FiscalYear | undefined {
  return loadDefaults()[id];
}

/** タブ表示用（YEAR_ORDER 順、未知の年度は末尾） */
export function listYears(): FiscalYear[] {
  const store = load();
  return Object.values(store).sort(
    (a, b) => yearRank(a.id) - yearRank(b.id)
  );
}

function yearRank(id: string): number {
  const i = YEAR_ORDER.indexOf(id);
  return i < 0 ? 999 : i;
}

/**
 * その年度における、あるメンバーのロール。
 * 割当が無ければ committee_member 扱い。master 判定は呼び出し側（メンバー属性）で行う。
 */
export function roleOf(yearId: string, memberId: string | null): Role {
  if (!memberId) return "committee_member";
  const year = load()[yearId];
  const a = year?.assignments.find((x) => x.memberId === memberId);
  return a?.role ?? "committee_member";
}

/** 委員会 id から、その委員会と所属年度を引く（委員会 id は年度ごとに一意） */
export function findCommittee(
  committeeId: string
): { year: FiscalYear; committee: Committee } | undefined {
  for (const year of Object.values(load())) {
    const committee = year.committees.find((c) => c.id === committeeId);
    if (committee) return { year, committee };
  }
  return undefined;
}

export function findCommitteeDefault(
  committeeId: string
): { year: FiscalYear; committee: Committee } | undefined {
  for (const year of Object.values(loadDefaults())) {
    const committee = year.committees.find((c) => c.id === committeeId);
    if (committee) return { year, committee };
  }
  return undefined;
}

/** 議案 id から所属委員会・年度を引く */
export function findCommitteeByGian(
  gianId: string
): { year: FiscalYear; committee: Committee } | undefined {
  for (const year of Object.values(load())) {
    const committee = year.committees.find((c) => c.gianIds.includes(gianId));
    if (committee) return { year, committee };
  }
  return undefined;
}

export function findCommitteeByGianDefault(
  gianId: string
): { year: FiscalYear; committee: Committee } | undefined {
  for (const year of Object.values(loadDefaults())) {
    const committee = year.committees.find((c) => c.gianIds.includes(gianId));
    if (committee) return { year, committee };
  }
  return undefined;
}

export function committeeOf(
  yearId: string,
  memberId: string | null
): Committee | undefined {
  if (!memberId) return undefined;
  const year = load()[yearId];
  const a = year?.assignments.find((x) => x.memberId === memberId);
  if (!a?.committeeId) return undefined;
  return year?.committees.find((c) => c.id === a.committeeId);
}

// ── 変更操作（master / 配信データ作成者が呼ぶ想定。権限チェックは画面側）──

/** メンバー権限：ロール割当を更新（無ければ追加） */
export function setAssignment(
  yearId: string,
  memberId: string,
  role: Role,
  committeeId?: string | null
): void {
  const store = load();
  const year = store[yearId];
  if (!year) return;
  const rest = year.assignments.filter((a) => a.memberId !== memberId);
  const next: RoleAssignment = { memberId, role };
  if (committeeId) next.committeeId = committeeId;
  commit({
    ...store,
    [yearId]: { ...year, assignments: [...rest, next] },
  });
}


/** 委員会に議案 id を追加（議案構築エリアの「新規作成」用） */
export function addGianToCommittee(
  committeeId: string,
  gianId: string
): void {
  const store = load();
  for (const [yid, year] of Object.entries(store)) {
    const idx = year.committees.findIndex((c) => c.id === committeeId);
    if (idx < 0) continue;
    const committee = year.committees[idx];
    if (committee.gianIds.includes(gianId)) return;
    const committees = [...year.committees];
    committees[idx] = { ...committee, gianIds: [...committee.gianIds, gianId] };
    commit({ ...store, [yid]: { ...year, committees } });
    return;
  }
}

/** 委員会から議案 id を外す */
export function removeGianFromCommittee(
  committeeId: string,
  gianId: string
): void {
  const store = load();
  for (const [yid, year] of Object.entries(store)) {
    const idx = year.committees.findIndex((c) => c.id === committeeId);
    if (idx < 0) continue;
    const committee = year.committees[idx];
    const committees = [...year.committees];
    committees[idx] = {
      ...committee,
      gianIds: committee.gianIds.filter((g) => g !== gianId),
    };
    commit({ ...store, [yid]: { ...year, committees } });
    return;
  }
}

/** 委員会フォルダを追加（`editCommittees` 権限。年度に紐づく） */
export function addCommittee(yearId: string, name: string): string | null {
  const n = name.trim();
  if (!n) return null;
  const store = load();
  const year = store[yearId];
  if (!year) return null;
  const id = `cm-${yearId.replace("fy-", "")}-${Date.now().toString(36)}`;
  commit({
    ...store,
    [yearId]: {
      ...year,
      committees: [...year.committees, { id, name: n, gianIds: [] }],
    },
  });
  return id;
}

/** 委員会フォルダの名称変更 */
export function renameCommittee(committeeId: string, name: string): void {
  const n = name.trim();
  if (!n) return;
  const store = load();
  for (const [yid, year] of Object.entries(store)) {
    const idx = year.committees.findIndex((c) => c.id === committeeId);
    if (idx < 0) continue;
    const committees = [...year.committees];
    committees[idx] = { ...committees[idx], name: n };
    commit({ ...store, [yid]: { ...year, committees } });
    return;
  }
}

/** 動作確認用：ストアを初期状態へ */
export function resetYearStore(): void {
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
