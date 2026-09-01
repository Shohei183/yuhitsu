"use client";

// ─────────────────────────────────────────────────────────────
// 次第（会議の進行表）ストア（本番: Supabase）
//
//  sidais(id, fiscal_year_id, period, doc jsonb, distribution_id, ...) に保存。
//  doc に Sidai 全体、fiscal_year_id / period / distribution_id は絞り込み用の列。
// ─────────────────────────────────────────────────────────────

import { Period } from "./yearStore";
import { sectionLabels } from "./templateStore";
import { db } from "./backend/client";

export type SidaiRowType =
  | "heading"
  | "progress"
  | "blank"
  | "filelink"
  | "minutes"
  | "attendance"
  | "deadlines";

export interface DeadlineEntry {
  id: string;
  meeting: string;
  meetingDate: string;
  noticeDate: string;
  docDate: string;
}

export interface SidaiRow {
  id: string;
  type: SidaiRowType;
  time: string;
  title: string;
  assignee: string;
  linkedGianId: string | null;
  linkedFixedFileId?: string | null;
  note: string;
  recorder?: string;
  signers?: string[];
  requiredCount?: string;
  presentCount?: string;
  quorum?: string;
  observerCount?: string;
  deadlineRows?: DeadlineEntry[];
}

export interface Sidai {
  id: string;
  yearId: string;
  period: Period;
  meetingName: string;
  datetime: string;
  place: string;
  chair: string;
  rows: SidaiRow[];
  createdAt: string;
  updatedAt: string;
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

// ── キャッシュ ──
let cache: SidaiStore = {};
let hydrated = false;
const EMPTY: SidaiStore = {};
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
  period: Period;
  doc: Sidai;
  distribution_id: string | null;
  created_at: string;
  updated_at: string;
};

export async function hydrate(): Promise<void> {
  const { data, error } = await db().from("sidais").select("*");
  if (error) {
    console.error("[sidaiStore] hydrate 失敗:", error.message);
    return;
  }
  const next: SidaiStore = {};
  for (const r of (data ?? []) as Row[]) {
    next[r.id] = {
      ...r.doc,
      id: r.id,
      yearId: r.fiscal_year_id,
      period: r.period,
      distributionId: r.distribution_id ?? r.doc.distributionId,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }
  cache = next;
  hydrated = true;
  notify();
}

export function getStore(): SidaiStore {
  return cache;
}
export function getStoreDefault(): SidaiStore {
  return EMPTY;
}
export function getSidai(id: string): Sidai | undefined {
  return cache[id];
}
export function getSidaiDefault(): Sidai | undefined {
  return undefined;
}

export function listSidai(): Sidai[] {
  return Object.values(cache).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export function listSidaiFor(yearId: string, period: Period): Sidai[] {
  return listSidai().filter((s) => s.yearId === yearId && s.period === period);
}

// ── 永続化 ──
async function persist(id: string): Promise<void> {
  const s = cache[id];
  if (!s) return;
  const { error } = await db().from("sidais").upsert({
    id,
    fiscal_year_id: s.yearId,
    period: s.period,
    doc: s,
    distribution_id: s.distributionId ?? null,
    updated_at: s.updatedAt,
  });
  if (error) console.error("[sidaiStore] 保存失敗:", error.message);
}

function setSidai(id: string, s: Sidai) {
  cache = { ...cache, [id]: s };
  notify();
}

// ── 変更操作 ──

export function saveSidai(id: string, sidai: Sidai): void {
  const next = { ...sidai, updatedAt: new Date().toISOString() };
  setSidai(id, next);
  void persist(id);
}

export function createSidai(opts: { yearId: string; period: Period }): string {
  const now = new Date().toISOString();
  const id = newId("sidai");

  const row = (type: SidaiRowType, title: string): SidaiRow => ({
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
  setSidai(id, sidai);
  void persist(id);
  return id;
}

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
    rows: src.rows.map((r) => ({
      ...clone(r),
      id: newId("row"),
      time: "",
      linkedGianId: null,
      linkedFixedFileId: null,
      note: "",
      recorder: r.recorder !== undefined ? "" : undefined,
      signers: r.signers ? r.signers.map(() => "") : undefined,
      presentCount: r.presentCount !== undefined ? "" : undefined,
      observerCount: r.observerCount !== undefined ? "" : undefined,
      deadlineRows: r.deadlineRows
        ? r.deadlineRows.map((d) => ({
            ...d,
            id: newId("dl"),
            meetingDate: "",
            noticeDate: "",
            docDate: "",
          }))
        : undefined,
    })),
  };
  setSidai(id, copy);
  void persist(id);
  return id;
}

export function deleteSidai(id: string): void {
  const next = { ...cache };
  delete next[id];
  cache = next;
  notify();
  void db().from("sidais").delete().eq("id", id);
}
