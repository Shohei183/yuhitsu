"use client";

// ─────────────────────────────────────────────────────────────
// 議案レビューメモ（個人用・完全非公開）ストア（本番: Supabase）
//
//  review_notes は RLS で「本人の行のみ」。hydrate も自分の分しか返らない。
//  配信された確定版議案に対する、会議での発言用の私的メモ。
// ─────────────────────────────────────────────────────────────

import { db, fire } from "./backend/client";
import { getState as getAuthState } from "./authStore";

export interface ReviewNote {
  id: string;
  authorId: string;
  distId: string;
  gianId: string;
  itemKey: string;
  itemLabel: string;
  quoteExact: string;
  quotePrefix: string;
  quoteSuffix: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export type ReviewNoteStore = Record<string, ReviewNote>;

let seq = 0;
function newId(): string {
  seq += 1;
  return `rn-${Date.now().toString(36)}-${seq}`;
}

let cache: ReviewNoteStore = {};
let hydrated = false;
const EMPTY: ReviewNoteStore = {};
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
  author_id: string;
  distribution_id: string;
  gian_id: string;
  item_key: string;
  item_label: string;
  quote_exact: string;
  quote_prefix: string;
  quote_suffix: string;
  body: string;
  created_at: string;
  updated_at: string;
};

function fromRow(r: Row): ReviewNote {
  return {
    id: r.id,
    authorId: r.author_id,
    distId: r.distribution_id,
    gianId: r.gian_id,
    itemKey: r.item_key,
    itemLabel: r.item_label,
    quoteExact: r.quote_exact,
    quotePrefix: r.quote_prefix,
    quoteSuffix: r.quote_suffix,
    body: r.body,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function hydrate(): Promise<void> {
  const { data, error } = await db().from("review_notes").select("*");
  if (error) {
    console.error("[reviewNoteStore] hydrate 失敗:", error.message);
    return;
  }
  const next: ReviewNoteStore = {};
  for (const r of (data ?? []) as Row[]) next[r.id] = fromRow(r);
  cache = next;
  hydrated = true;
  notify();
}

export function getStore(): ReviewNoteStore {
  return cache;
}
export function getStoreDefault(): ReviewNoteStore {
  return EMPTY;
}

export function listNotes(): ReviewNote[] {
  return Object.values(cache).sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt)
  );
}
export function notesFor(distId: string, gianId: string): ReviewNote[] {
  return listNotes().filter((n) => n.distId === distId && n.gianId === gianId);
}
export function notesForDist(distId: string): ReviewNote[] {
  return listNotes().filter((n) => n.distId === distId);
}

// ── 永続化 ──
async function persist(id: string): Promise<void> {
  const n = cache[id];
  if (!n) return;
  const { error } = await db().from("review_notes").upsert({
    id,
    author_id: n.authorId,
    distribution_id: n.distId,
    gian_id: n.gianId,
    item_key: n.itemKey,
    item_label: n.itemLabel,
    quote_exact: n.quoteExact,
    quote_prefix: n.quotePrefix,
    quote_suffix: n.quoteSuffix,
    body: n.body,
    updated_at: n.updatedAt,
  });
  if (error) console.error("[reviewNoteStore] 保存失敗:", error.message);
}

function set(id: string, n: ReviewNote) {
  cache = { ...cache, [id]: n };
  notify();
}

export interface NewNoteInput {
  distId: string;
  gianId: string;
  itemKey: string;
  itemLabel: string;
  quoteExact: string;
  quotePrefix: string;
  quoteSuffix: string;
  body: string;
}

export function addNote(input: NewNoteInput): string | null {
  const authorId = getAuthState().userId;
  if (!authorId) return null;
  const now = new Date().toISOString();
  const n: ReviewNote = {
    id: newId(),
    authorId,
    ...input,
    createdAt: now,
    updatedAt: now,
  };
  set(n.id, n);
  void persist(n.id);
  return n.id;
}

export function updateNoteBody(id: string, body: string): void {
  const n = cache[id];
  if (!n) return;
  set(id, { ...n, body, updatedAt: new Date().toISOString() });
  void persist(id);
}

export function deleteNote(id: string): void {
  const next = { ...cache };
  delete next[id];
  cache = next;
  notify();
  fire(db().from("review_notes").delete().eq("id", id));
}
