// ─────────────────────────────────────────────────────────────
// 議案の状態ストア（上程フロー）
//
// プロトタイプでは外部サービスに繋がず、ブラウザの localStorage を
// 唯一の保存先とする（＝Supabase 等は入れない方針のまま）。
// - 編集内容の保存
// - 「会議へ上程」時のスナップショット保存
// - 状態遷移（編集中 → 上程済み → 配信確定）
// - 差し替え申請と（仮の）承認
// - 上程済み議案の一覧取得（次第作成画面で使用予定）
// ─────────────────────────────────────────────────────────────

import { Gian, GianKind, MOCK_GIANS } from "./mockData";
import { getGianTemplate } from "./templateStore";

const LS_KEY = "yuhitsu.gian-store.v2";

/** 直近何件まで保持するか（下書き・同期スナップショット） */
export const AUTOSAVE_LIMIT = 5;

export type SnapshotKind =
  | "submission" // 上程時：正式な記録。ラベル付きで永続保存
  | "autosave"; // 下書き保存・オフライン同期時：保険用の一時記録（直近 AUTOSAVE_LIMIT 件）

/** ある時点の議案の完全コピー（本文・資料一覧を含む） */
export interface Snapshot {
  id: string;
  /** 取得日時（ISO） */
  takenAt: string;
  /** 種別 */
  kind: SnapshotKind;
  /** 取得理由（例：会議へ上程〔3月度定例理事会〕 / 下書き保存 / オフライン同期） */
  reason: string;
  gian: Gian;
}

export type ReplacementStatus = "pending" | "approved" | "rejected";

/** 上程済みの議案に対する差し替え申請 */
export interface ReplacementRequest {
  id: string;
  requestedAt: string;
  note: string;
  status: ReplacementStatus;
  decidedAt: string | null;
}

export interface GianEntry {
  gian: Gian;
  snapshots: Snapshot[];
  requests: ReplacementRequest[];
}

export type GianStore = Record<string, GianEntry>;

function clone<T>(v: T): T {
  return typeof structuredClone === "function"
    ? structuredClone(v)
    : (JSON.parse(JSON.stringify(v)) as T);
}

let seq = 0;
function newId(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

function buildDefaults(): GianStore {
  const store: GianStore = {};
  for (const g of MOCK_GIANS) {
    store[g.id] = { gian: clone(g), snapshots: [], requests: [] };
  }
  return store;
}

// ── キャッシュ ──
// localStorage は読み書きコストがあるため、メモリ上のキャッシュを正とする。
let cache: GianStore | null = null;
let defaultsCache: GianStore | null = null;

/** localStorage を読まない、常に初期状態のストア（SSR / ハイドレーション用） */
function loadDefaults(): GianStore {
  if (!defaultsCache) defaultsCache = buildDefaults();
  return defaultsCache;
}

/** localStorage を反映したストア（クライアント用） */
function load(): GianStore {
  if (cache) return cache;
  if (typeof window === "undefined") {
    cache = loadDefaults();
    return cache;
  }
  const base = buildDefaults();
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as GianStore;
      // mock の議案は必ず存在させる（後から mock を増やしても壊れない）
      cache = { ...base, ...parsed };
      return cache;
    }
  } catch {
    /* 破損時は初期状態にフォールバック */
  }
  cache = base;
  return cache;
}

const listeners = new Set<() => void>();

function commit(next: GianStore): void {
  cache = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(LS_KEY, JSON.stringify(next));
    } catch {
      /* 容量超過等は無視（プロトタイプ） */
    }
  }
  listeners.forEach((fn) => fn());
}

// ── 購読（useSyncExternalStore 用）──
export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getStore(): GianStore {
  return load();
}

export function getStoreDefault(): GianStore {
  return loadDefaults();
}

export function getEntry(id: string): GianEntry | undefined {
  return load()[id];
}

export function getEntryDefault(id: string): GianEntry | undefined {
  return loadDefaults()[id];
}

// ── 変更操作 ──

/** 編集内容を保存 */
export function saveGian(id: string, gian: Gian): void {
  const store = load();
  const entry = store[id];
  if (!entry) return;
  commit({ ...store, [id]: { ...entry, gian } });
}

/**
 * 下書き保存・オフライン同期時のスナップショット（保険用の一時記録）。
 * kind="autosave" のものは直近 AUTOSAVE_LIMIT 件のみ保持し、古いものから自動削除する。
 * kind="submission" の正式記録には一切手を触れない。
 */
export function saveDraftSnapshot(id: string, reason: string): Snapshot | null {
  const store = load();
  const entry = store[id];
  if (!entry) return null;

  const snapshot: Snapshot = {
    id: newId("snap"),
    takenAt: new Date().toISOString(),
    kind: "autosave",
    reason,
    gian: clone(entry.gian),
  };

  const submissions = entry.snapshots.filter((s) => s.kind === "submission");
  const autosaves = [
    ...entry.snapshots.filter((s) => s.kind === "autosave"),
    snapshot,
  ].slice(-AUTOSAVE_LIMIT); // 6件目以降は最も古い1件を落とす

  // 時系列順に統合（表示側は新しい順に並べ替える）
  const merged = [...submissions, ...autosaves].sort((a, b) =>
    a.takenAt.localeCompare(b.takenAt)
  );

  commit({ ...store, [id]: { ...entry, snapshots: merged } });
  return snapshot;
}

/** 会議へ上程：その時点のスナップショットを取り、状態を「上程済み」へ */
export function submitGian(id: string): Snapshot | null {
  const store = load();
  const entry = store[id];
  if (!entry || entry.gian.status !== "editing") return null;

  const snapshot: Snapshot = {
    id: newId("snap"),
    takenAt: new Date().toISOString(),
    kind: "submission",
    reason: `会議へ上程〔${entry.gian.submissionMeeting}〕`,
    gian: clone(entry.gian),
  };
  commit({
    ...store,
    [id]: {
      ...entry,
      gian: { ...entry.gian, status: "submitted" },
      snapshots: [...entry.snapshots, snapshot],
    },
  });
  return snapshot;
}

/** 差し替え申請（上程済みの議案に対して） */
export function requestReplacement(id: string, note: string): void {
  const store = load();
  const entry = store[id];
  if (!entry) return;
  const req: ReplacementRequest = {
    id: newId("req"),
    requestedAt: new Date().toISOString(),
    note: note.trim(),
    status: "pending",
    decidedAt: null,
  };
  commit({ ...store, [id]: { ...entry, requests: [...entry.requests, req] } });
}

/** 差し替え申請の承認／却下（※承認機能は仮：承認すると編集中に戻す） */
export function decideReplacement(
  id: string,
  requestId: string,
  approve: boolean
): void {
  const store = load();
  const entry = store[id];
  if (!entry) return;
  const now = new Date().toISOString();
  commit({
    ...store,
    [id]: {
      ...entry,
      gian: approve ? { ...entry.gian, status: "editing" } : entry.gian,
      requests: entry.requests.map((r) =>
        r.id === requestId
          ? { ...r, status: approve ? "approved" : "rejected", decidedAt: now }
          : r
      ),
    },
  });
}

/** 配信確定（モック：本来は次第作成／配信フローで行う） */
export function lockGian(id: string): void {
  const store = load();
  const entry = store[id];
  if (!entry || entry.gian.status === "editing") return;
  const snapshot: Snapshot = {
    id: newId("snap"),
    takenAt: new Date().toISOString(),
    kind: "submission",
    reason: "配信確定",
    gian: clone(entry.gian),
  };
  commit({
    ...store,
    [id]: {
      ...entry,
      gian: { ...entry.gian, status: "locked" },
      snapshots: [...entry.snapshots, snapshot],
    },
  });
}

const LOM_NAME = "一般社団法人小牧青年会議所";

/**
 * 新規議案を作成し、その id を返す。
 * 事業要綱・事業概要の項目ラベルは、その年度の議案テンプレート（templateStore）から取る。
 */
export function createGian(opts: {
  yearId: string;
  committee: string;
  kind: GianKind;
}): string {
  const id = newId("gian");
  const tpl = getGianTemplate(opts.yearId, opts.kind);
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "年") + "日";

  const gian: Gian = {
    id,
    committee: opts.committee,
    kind: opts.kind,
    status: "editing",
    lomName: LOM_NAME,
    submissionMeeting: "",
    topic:
      opts.kind === "基本方針"
        ? "（新規）事業計画（案）"
        : `（新規）${opts.kind}議案`,
    proposalType: KIND_TYPE[opts.kind],
    proposalDate: "",
    proposerRole: `${opts.committee}　委員長`,
    proposerName: "",
    author: "",
    createdAt: today,
    courtesyLetter: "",
    mediaRequest: "",
    submissionSchedule: [],
    vpConfirmDate: "",
    priorFeedback: [],
    outline: tpl.outline.map((it, i) => ({
      no: i + 1,
      label: it.label,
      body: "",
    })),
    overview: tpl.overview.map((it, i) => ({
      no: i + 1,
      label: it.label,
      body: "",
    })),
    implementationSchedule: [{ id: newId("sch"), date: "", content: "" }],
    reviewResources: [],
    referenceResources: [],
  };

  if (opts.kind === "基本方針") {
    gian.assignedMembers = [
      { id: newId("am"), role: "事務局長", name: "" },
      { id: newId("am"), role: "担当副理事長", name: "" },
    ];
    gian.committeeBudget = {
      income: [{ id: newId("bi"), label: "", amount: "" }],
      expense: [{ id: newId("be"), label: "", amount: "" }],
    };
  }

  const store = load();
  commit({ ...store, [id]: { gian, snapshots: [], requests: [] } });
  return id;
}

const KIND_TYPE: Record<GianKind, string> = {
  協議: "協議事項",
  審議: "審議事項",
  決算協議: "協議事項",
  決算審議: "審議事項",
  基本方針: "基本方針",
};

/** 「前回までの流れ（意見と対応）」を表示する議案種別（協議系＋基本方針） */
export function showsPriorFeedback(kind: GianKind): boolean {
  return kind === "協議" || kind === "決算協議" || kind === "基本方針";
}

/** 基本方針（事務局事業計画など・事業計画から個別議案へリンク）か */
export function isKihon(kind: GianKind): boolean {
  return kind === "基本方針";
}

/**
 * 議案を複製して新しい編集中の議案を作る。
 * - 事業要綱・事業概要・スケジュール・前回までの流れの内容はそのまま引き継ぐ。
 * - targetKind を指定すると種別を変更（協議→審議、決算協議→決算審議 など）。
 * - status は "editing"、スナップショット・差し替え申請はリセット。
 */
export function duplicateGian(
  sourceId: string,
  targetKind?: GianKind
): string | null {
  const store = load();
  const src = store[sourceId]?.gian ?? MOCK_GIANS.find((g) => g.id === sourceId);
  if (!src) return null;

  const id = newId("gian");
  const kind = targetKind ?? src.kind;
  const kindChanged = kind !== src.kind;

  const copy: Gian = {
    ...clone(src),
    id,
    kind,
    status: "editing",
    proposalType: KIND_TYPE[kind],
    topic: kindChanged
      ? src.topic.replace(/（.*?）$/, "") + `（${kind}）`
      : `${src.topic}（複製）`,
    // 「前回までの流れ」は協議系（協議・決算協議）のみ。それ以外に複製したらクリア
    priorFeedback: showsPriorFeedback(kind) ? clone(src.priorFeedback) : [],
    createdAt:
      new Date().toISOString().slice(0, 10).replace(/-/g, "年") + "日",
  };

  commit({ ...store, [id]: { gian: copy, snapshots: [], requests: [] } });
  return id;
}

/** 議案を削除（動作確認・下書き破棄用。編集中のもののみ） */
export function deleteGian(id: string): boolean {
  const store = load();
  const entry = store[id];
  if (!entry || entry.gian.status !== "editing") return false;
  if (MOCK_GIANS.some((g) => g.id === id)) return false; // モック議案は消さない
  const next = { ...store };
  delete next[id];
  commit(next);
  return true;
}

/** この議案を初期（モック）状態に戻す（動作確認用） */
export function resetGian(id: string): void {
  const base = MOCK_GIANS.find((g) => g.id === id);
  if (!base) return;
  const store = load();
  commit({
    ...store,
    [id]: { gian: clone(base), snapshots: [], requests: [] },
  });
}

// ── 取得系 ──

/**
 * 上程済み（＝「上程済み」または「配信確定」）の議案一覧。
 * 次第作成画面で参照する予定。
 */
export function listSubmittedGians(): GianEntry[] {
  return Object.values(load()).filter(
    (e) => e.gian.status === "submitted" || e.gian.status === "locked"
  );
}
