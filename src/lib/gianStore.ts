"use client";

// ─────────────────────────────────────────────────────────────
// 議案の状態ストア（上程フロー・本番: Supabase）
//
//  gians(doc jsonb) / gian_snapshots(doc jsonb) / replacement_requests
//  を起動時に読み込み、GianStore へ組み立てる。
//  変更は cache を楽観更新（同期）＋ 非同期で Supabase へ書き込み。
// ─────────────────────────────────────────────────────────────

import { Gian, GianKind } from "./mockData";
import { getGianTemplate } from "./templateStore";
import {
  findCommittee,
  addGianToCommittee,
  removeGianFromCommittee,
  syncCommitteeGians,
} from "./yearStore";
import { db, fire } from "./backend/client";

export const AUTOSAVE_LIMIT = 5;

export type SnapshotKind = "submission" | "autosave";

export interface Snapshot {
  id: string;
  takenAt: string;
  kind: SnapshotKind;
  reason: string;
  gian: Gian;
}

export type ReplacementStatus = "pending" | "approved" | "rejected";

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

// ── キャッシュ ──
let cache: GianStore = {};
let hydrated = false;
/** deleteGian 済みの id。永続化・再ハイドレートで復活させないためのガード */
const deletedGianIds = new Set<string>();
const EMPTY: GianStore = {};
const listeners = new Set<() => void>();

export function isHydrated(): boolean {
  return hydrated;
}
function notify() {
  listeners.forEach((fn) => fn());
}
export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function yearIdOf(gian: Gian): string | null {
  if (gian.yearId) return gian.yearId;
  const c = gian.committeeId ? findCommittee(gian.committeeId) : undefined;
  return c?.year.id ?? null;
}

// ── ハイドレーション ──
export async function hydrate(): Promise<void> {
  const [gians, snaps, reqs] = await Promise.all([
    db().from("gians").select("*"),
    db().from("gian_snapshots").select("*"),
    db().from("replacement_requests").select("*"),
  ]);
  if (gians.error || snaps.error || reqs.error) {
    console.error(
      "[gianStore] hydrate 失敗:",
      gians.error?.message || snaps.error?.message || reqs.error?.message
    );
    return;
  }

  const next: GianStore = {};
  for (const r of (gians.data ?? []) as GianRow[]) {
    if (deletedGianIds.has(r.id)) continue; // 削除処理中の議案は取り込まない
    next[r.id] = { gian: normalizeGian(r), snapshots: [], requests: [] };
  }
  for (const s of (snaps.data ?? []) as SnapRow[]) {
    next[s.gian_id]?.snapshots.push({
      id: s.id,
      takenAt: s.taken_at,
      kind: s.kind,
      reason: s.reason,
      gian: s.doc,
    });
  }
  for (const q of (reqs.data ?? []) as ReqRow[]) {
    next[q.gian_id]?.requests.push({
      id: q.id,
      requestedAt: q.requested_at,
      note: q.note,
      status: q.status,
      decidedAt: q.decided_at,
    });
  }
  for (const e of Object.values(next)) {
    e.snapshots.sort((a, b) => a.takenAt.localeCompare(b.takenAt));
  }

  cache = next;
  hydrated = true;
  notify();

  syncCommitteeGians(
    Object.values(next).map((e) => ({
      gianId: e.gian.id,
      committeeId: e.gian.committeeId ?? null,
    }))
  );
}

type GianRow = {
  id: string;
  fiscal_year_id: string;
  committee_id: string | null;
  kind: string;
  status: string;
  doc: Gian;
};
type SnapRow = {
  id: string;
  gian_id: string;
  kind: SnapshotKind;
  reason: string;
  taken_at: string;
  doc: Gian;
};
type ReqRow = {
  id: string;
  gian_id: string;
  requested_at: string;
  note: string;
  status: ReplacementStatus;
  decided_at: string | null;
};

function normalizeGian(r: GianRow): Gian {
  return {
    ...r.doc,
    id: r.id,
    yearId: r.fiscal_year_id,
    committeeId: r.committee_id ?? r.doc.committeeId,
    kind: r.kind as GianKind,
    status: r.doc.status,
  };
}

// ── 読み取り ──
export function getStore(): GianStore {
  return cache;
}
export function getStoreDefault(): GianStore {
  return EMPTY;
}
export function getEntry(id: string): GianEntry | undefined {
  return cache[id];
}
export function getEntryDefault(): GianEntry | undefined {
  return undefined;
}

export function listSubmittedGians(): GianEntry[] {
  return Object.values(cache).filter(
    (e) => e.gian.status === "submitted" || e.gian.status === "locked"
  );
}

export function showsPriorFeedback(kind: GianKind): boolean {
  return kind === "協議" || kind === "決算協議" || kind === "基本方針";
}
export function isKihon(kind: GianKind): boolean {
  return kind === "基本方針";
}

// ── 永続化ヘルパー ──
async function persistGian(id: string): Promise<void> {
  if (deletedGianIds.has(id)) return; // 削除済みは書き戻さない
  const e = cache[id];
  if (!e) return;
  const yid = yearIdOf(e.gian);
  if (!yid) {
    console.error("[gianStore] 年度が特定できず保存できません:", id);
    return;
  }
  const { error } = await db().from("gians").upsert({
    id,
    fiscal_year_id: yid,
    committee_id: e.gian.committeeId ?? null,
    kind: e.gian.kind,
    status: e.gian.status,
    doc: e.gian,
    updated_at: new Date().toISOString(),
  });
  if (error) console.error("[gianStore] gian 保存失敗:", error.message);
}

async function persistSnapshot(gianId: string, snap: Snapshot): Promise<void> {
  const { error } = await db().from("gian_snapshots").insert({
    id: snap.id,
    gian_id: gianId,
    kind: snap.kind,
    reason: snap.reason,
    taken_at: snap.takenAt,
    doc: snap.gian,
  });
  if (error) console.error("[gianStore] snapshot 保存失敗:", error.message);
}

async function pruneAutosaves(gianId: string): Promise<void> {
  const e = cache[gianId];
  if (!e) return;
  const autosaveIds = e.snapshots
    .filter((s) => s.kind === "autosave")
    .map((s) => s.id);
  // cache 側で AUTOSAVE_LIMIT に絞った後、DB からあふれた分を消す
  const { data } = await db()
    .from("gian_snapshots")
    .select("id")
    .eq("gian_id", gianId)
    .eq("kind", "autosave");
  const stale = ((data ?? []) as { id: string }[])
    .map((r) => r.id)
    .filter((id) => !autosaveIds.includes(id));
  if (stale.length) {
    await db().from("gian_snapshots").delete().in("id", stale);
  }
}

function setEntry(id: string, entry: GianEntry) {
  cache = { ...cache, [id]: entry };
  notify();
}

// ── 変更操作 ──

export function saveGian(id: string, gian: Gian): void {
  const entry = cache[id];
  if (!entry) return;
  setEntry(id, {
    ...entry,
    gian: { ...gian, yearId: entry.gian.yearId, committeeId: entry.gian.committeeId },
  });
  void persistGian(id);
}

export function saveDraftSnapshot(id: string, reason: string): Snapshot | null {
  const entry = cache[id];
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
  ].slice(-AUTOSAVE_LIMIT);
  const merged = [...submissions, ...autosaves].sort((a, b) =>
    a.takenAt.localeCompare(b.takenAt)
  );
  setEntry(id, { ...entry, snapshots: merged });
  void persistSnapshot(id, snapshot).then(() => pruneAutosaves(id));
  return snapshot;
}

export function submitGian(id: string): Snapshot | null {
  const entry = cache[id];
  if (!entry || entry.gian.status !== "editing") return null;
  const snapshot: Snapshot = {
    id: newId("snap"),
    takenAt: new Date().toISOString(),
    kind: "submission",
    reason: `会議へ上程〔${entry.gian.submissionMeeting}〕`,
    gian: clone({ ...entry.gian, status: "submitted" as const }),
  };
  setEntry(id, {
    ...entry,
    gian: { ...entry.gian, status: "submitted" },
    snapshots: [...entry.snapshots, snapshot],
  });
  void persistGian(id).then(() => persistSnapshot(id, snapshot));
  return snapshot;
}

export function requestReplacement(id: string, note: string): void {
  const entry = cache[id];
  if (!entry) return;
  const req: ReplacementRequest = {
    id: newId("req"),
    requestedAt: new Date().toISOString(),
    note: note.trim(),
    status: "pending",
    decidedAt: null,
  };
  setEntry(id, { ...entry, requests: [...entry.requests, req] });
  fire(
    db().from("replacement_requests").insert({
      id: req.id,
      gian_id: id,
      requested_at: req.requestedAt,
      note: req.note,
      status: req.status,
      decided_at: null,
    })
  );
}

export function decideReplacement(
  id: string,
  requestId: string,
  approve: boolean
): void {
  const entry = cache[id];
  if (!entry) return;
  const now = new Date().toISOString();
  const gian = approve ? { ...entry.gian, status: "editing" as const } : entry.gian;
  setEntry(id, {
    ...entry,
    gian,
    requests: entry.requests.map((r) =>
      r.id === requestId
        ? { ...r, status: approve ? "approved" : "rejected", decidedAt: now }
        : r
    ),
  });
  fire(
    db()
      .from("replacement_requests")
      .update({
        status: approve ? "approved" : "rejected",
        decided_at: now,
      })
      .eq("id", requestId)
  );
  if (approve) void persistGian(id);
}

export function lockGian(id: string): void {
  const entry = cache[id];
  if (!entry || entry.gian.status === "editing") return;
  const snapshot: Snapshot = {
    id: newId("snap"),
    takenAt: new Date().toISOString(),
    kind: "submission",
    reason: "配信確定",
    gian: clone({ ...entry.gian, status: "locked" as const }),
  };
  setEntry(id, {
    ...entry,
    gian: { ...entry.gian, status: "locked" },
    snapshots: [...entry.snapshots, snapshot],
  });
  void persistGian(id).then(() => persistSnapshot(id, snapshot));
}

const LOM_NAME = "一般社団法人小牧青年会議所";

const KIND_TYPE: Record<GianKind, string> = {
  協議: "協議事項",
  審議: "審議事項",
  決算協議: "協議事項",
  決算審議: "審議事項",
  基本方針: "基本方針",
};

export function createGian(opts: {
  yearId: string;
  committee: string;
  committeeId: string;
  kind: GianKind;
}): string {
  const id = newId("gian");
  const tpl = getGianTemplate(opts.yearId, opts.kind);
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "年") + "日";

  const gian: Gian = {
    id,
    committee: opts.committee,
    committeeId: opts.committeeId,
    yearId: opts.yearId,
    kind: opts.kind,
    status: "editing",
    lomName: LOM_NAME,
    submissionMeeting: "",
    topic:
      opts.kind === "基本方針" ? "（新規）事業計画（案）" : `（新規）${opts.kind}議案`,
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
    outline: tpl.outline.map((it, i) => ({ no: i + 1, label: it.label, body: "" })),
    overview: tpl.overview.map((it, i) => ({ no: i + 1, label: it.label, body: "" })),
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

  setEntry(id, { gian, snapshots: [], requests: [] });
  addGianToCommittee(opts.committeeId, id);
  void persistGian(id);
  return id;
}

export function duplicateGian(
  sourceId: string,
  targetKind?: GianKind
): string | null {
  const src = cache[sourceId]?.gian;
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
    priorFeedback: showsPriorFeedback(kind) ? clone(src.priorFeedback) : [],
    createdAt: new Date().toISOString().slice(0, 10).replace(/-/g, "年") + "日",
  };

  setEntry(id, { gian: copy, snapshots: [], requests: [] });
  if (copy.committeeId) addGianToCommittee(copy.committeeId, id);
  void persistGian(id);
  return id;
}

export function deleteGian(id: string): boolean {
  const entry = cache[id];
  if (!entry || entry.gian.status !== "editing") return false;
  const committeeId = entry.gian.committeeId;
  deletedGianIds.add(id);
  const next = { ...cache };
  delete next[id];
  cache = next;
  notify();
  if (committeeId) removeGianFromCommittee(committeeId, id);
  fire(db().from("gians").delete().eq("id", id));
  return true;
}
