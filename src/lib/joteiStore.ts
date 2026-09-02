"use client";

// ─────────────────────────────────────────────────────────────
// 上程届（じょうていとどけ）ストア（本番: Supabase）
//
//  委員会が会議ごとに提出する「上程届」。協議事項／審議事項／報告事項の
//  3区分に、その会議へ上程する議案・報告の一覧を記す。
//  jotei_todokes(id, fiscal_year_id, committee_id, status, meeting_name, doc jsonb, submitted_at)
//  doc に JoteiTodoke 全体。提出（submit）でロック。会議ごとに別レコード。
// ─────────────────────────────────────────────────────────────

import { db, fire } from "./backend/client";

/** 上程届の1項目（区分内の1行）。gianId で議案構築の議案に任意で紐づく。 */
export interface JoteiItem {
  id: string;
  title: string;
  gianId?: string | null;
}

export type JoteiSection = "kyogi" | "shingi" | "houkoku";

export const JOTEI_SECTIONS: { key: JoteiSection; label: string }[] = [
  { key: "kyogi", label: "協議事項" },
  { key: "shingi", label: "審議事項" },
  { key: "houkoku", label: "報告事項" },
];

export type JoteiStatus = "draft" | "submitted";

export interface JoteiTodoke {
  id: string;
  yearId: string;
  committeeId: string;
  /** 委員会名のスナップショット（委員会名変更・削除に耐える） */
  committeeName: string;
  /** 提出先の会議「7月度定例理事会」など */
  meetingName: string;
  /** 提出日 */
  submissionDate: string;
  /** 提出者の役職「委員長」 */
  submitterRole: string;
  /** 提出者の氏名 */
  submitterName: string;
  kyogi: JoteiItem[];
  shingi: JoteiItem[];
  houkoku: JoteiItem[];
  status: JoteiStatus;
  submittedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type JoteiStore = Record<string, JoteiTodoke>;

let seq = 0;
function newId(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

export function blankItem(): JoteiItem {
  return { id: newId("ji"), title: "", gianId: null };
}

export function sectionItems(j: JoteiTodoke, s: JoteiSection): JoteiItem[] {
  return s === "kyogi" ? j.kyogi : s === "shingi" ? j.shingi : j.houkoku;
}

export function withSection(
  j: JoteiTodoke,
  s: JoteiSection,
  items: JoteiItem[]
): JoteiTodoke {
  if (s === "kyogi") return { ...j, kyogi: items };
  if (s === "shingi") return { ...j, shingi: items };
  return { ...j, houkoku: items };
}

function normalize(raw: Partial<JoteiTodoke>): JoteiTodoke {
  const arr = (v: unknown): JoteiItem[] =>
    Array.isArray(v)
      ? (v as JoteiItem[]).map((it) => ({
          id: it.id || newId("ji"),
          title: typeof it.title === "string" ? it.title : "",
          gianId: it.gianId ?? null,
        }))
      : [];
  return {
    id: raw.id ?? newId("jotei"),
    yearId: raw.yearId ?? "",
    committeeId: raw.committeeId ?? "",
    committeeName: raw.committeeName ?? "",
    meetingName: raw.meetingName ?? "",
    submissionDate: raw.submissionDate ?? "",
    submitterRole: raw.submitterRole ?? "委員長",
    submitterName: raw.submitterName ?? "",
    kyogi: arr(raw.kyogi),
    shingi: arr(raw.shingi),
    houkoku: arr(raw.houkoku),
    status: raw.status === "submitted" ? "submitted" : "draft",
    submittedAt: raw.submittedAt ?? null,
    createdAt: raw.createdAt ?? new Date().toISOString(),
    updatedAt: raw.updatedAt ?? new Date().toISOString(),
  };
}

// ── キャッシュ ──
let cache: JoteiStore = {};
let hydrated = false;
const EMPTY: JoteiStore = {};
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

type Row = {
  id: string;
  fiscal_year_id: string;
  committee_id: string | null;
  status: JoteiStatus;
  meeting_name: string;
  doc: JoteiTodoke;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function hydrate(): Promise<void> {
  const { data, error } = await db().from("jotei_todokes").select("*");
  if (error) {
    console.error("[joteiStore] hydrate 失敗:", error.message);
    return;
  }
  const next: JoteiStore = {};
  for (const r of (data ?? []) as Row[]) {
    next[r.id] = normalize({
      ...r.doc,
      id: r.id,
      yearId: r.fiscal_year_id,
      committeeId: r.committee_id ?? r.doc.committeeId,
      status: r.status,
      meetingName: r.meeting_name || r.doc.meetingName,
      submittedAt: r.submitted_at ?? r.doc.submittedAt,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    });
  }
  cache = next;
  hydrated = true;
  notify();
}

export function getStore(): JoteiStore {
  return cache;
}
export function getStoreDefault(): JoteiStore {
  return EMPTY;
}
export function getJotei(id: string): JoteiTodoke | undefined {
  return cache[id];
}
export function getJoteiDefault(): JoteiTodoke | undefined {
  return undefined;
}

export function listJotei(): JoteiTodoke[] {
  return Object.values(cache).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt)
  );
}
export function listJoteiForCommittee(committeeId: string): JoteiTodoke[] {
  return listJotei().filter((j) => j.committeeId === committeeId);
}
export function listJoteiForYear(yearId: string): JoteiTodoke[] {
  return listJotei().filter((j) => j.yearId === yearId);
}
/** 年度内の「提出済み」上程届に登場する会議名（重複なし・新しい順） */
export function submittedMeetings(yearId: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const j of listJoteiForYear(yearId)) {
    if (j.status !== "submitted") continue;
    const m = j.meetingName.trim();
    if (!m || seen.has(m)) continue;
    seen.add(m);
    out.push(m);
  }
  return out;
}

// ── 永続化 ──
async function persist(id: string): Promise<void> {
  const j = cache[id];
  if (!j) return;
  const { error } = await db().from("jotei_todokes").upsert({
    id,
    fiscal_year_id: j.yearId,
    committee_id: j.committeeId || null,
    status: j.status,
    meeting_name: j.meetingName,
    doc: j,
    submitted_at: j.submittedAt ?? null,
    updated_at: j.updatedAt,
  });
  if (error) console.error("[joteiStore] 保存失敗:", error.message);
}

function set(id: string, j: JoteiTodoke) {
  cache = { ...cache, [id]: j };
  notify();
}

// ── 変更操作 ──
export function createJotei(opts: {
  yearId: string;
  committeeId: string;
  committeeName: string;
  submitterName?: string;
  submitterRole?: string;
}): string {
  const now = new Date().toISOString();
  const j: JoteiTodoke = normalize({
    yearId: opts.yearId,
    committeeId: opts.committeeId,
    committeeName: opts.committeeName,
    submitterRole: opts.submitterRole ?? "委員長",
    submitterName: opts.submitterName ?? "",
    submissionDate: now.slice(0, 10),
    createdAt: now,
    updatedAt: now,
  });
  set(j.id, j);
  void persist(j.id);
  return j.id;
}

export function saveJotei(id: string, doc: JoteiTodoke): void {
  const cur = cache[id];
  if (cur?.status === "submitted") return; // 提出済みはロック
  set(id, { ...doc, updatedAt: new Date().toISOString() });
  void persist(id);
}

/** 提出＝ロック。以降 saveJotei は無効。 */
export function submitJotei(id: string): void {
  const j = cache[id];
  if (!j || j.status === "submitted") return;
  const now = new Date().toISOString();
  set(id, { ...j, status: "submitted", submittedAt: now, updatedAt: now });
  void persist(id);
}

/** 提出の取り消し（マスター等の権限者のみ UI で許可）。編集可能に戻す。 */
export function reopenJotei(id: string): void {
  const j = cache[id];
  if (!j || j.status !== "submitted") return;
  const now = new Date().toISOString();
  set(id, { ...j, status: "draft", submittedAt: null, updatedAt: now });
  void persist(id);
}

export function deleteJotei(id: string): void {
  const next = { ...cache };
  delete next[id];
  cache = next;
  notify();
  fire(db().from("jotei_todokes").delete().eq("id", id));
}
