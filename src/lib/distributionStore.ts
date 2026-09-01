"use client";

// ─────────────────────────────────────────────────────────────
// 配信データ（配信確定パッケージ）ストア（本番: Supabase）
//
//  distributions(id, fiscal_year_id, period, name, version, board,
//  occurrence, source_sidai_id, finalized_at, doc jsonb) に保存。
//  資料の凍結コピーは /api/files/copy（R2 内でオブジェクト複製）。
// ─────────────────────────────────────────────────────────────

import { Gian } from "./mockData";
import { getEntry as getGianEntry, lockGian } from "./gianStore";
import { GianFileMeta } from "./gianFilesDb";
import { Sidai, getSidai, saveSidai } from "./sidaiStore";
import { Period } from "./yearStore";
import { db, callApi } from "./backend/client";

export type Board = "理事会" | "三役会";
export const BOARDS: Board[] = ["理事会", "三役会"];

export interface DistributionPackage {
  id: string;
  yearId: string;
  period: Period;
  name: string;
  version: number;
  board: Board;
  occurrence: string;
  finalizedAt: string;
  sourceSidaiId: string;
  sidai: Sidai;
  gians: Gian[];
  gianFiles: Record<string, { review: GianFileMeta[]; reference: GianFileMeta[] }>;
}

export type DistributionStore = Record<string, DistributionPackage>;

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
let cache: DistributionStore = {};
let hydrated = false;
const EMPTY: DistributionStore = {};
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

export async function hydrate(): Promise<void> {
  const { data, error } = await db().from("distributions").select("*");
  if (error) {
    console.error("[distributionStore] hydrate 失敗:", error.message);
    return;
  }
  const next: DistributionStore = {};
  for (const r of (data ?? []) as { id: string; doc: DistributionPackage }[]) {
    next[r.id] = r.doc;
  }
  cache = next;
  hydrated = true;
  notify();
}

export function getStore(): DistributionStore {
  return cache;
}
export function getStoreDefault(): DistributionStore {
  return EMPTY;
}
export function getDistribution(id: string): DistributionPackage | undefined {
  return cache[id];
}
export function getDistributionDefault(): DistributionPackage | undefined {
  return undefined;
}

export function listDistributions(): DistributionPackage[] {
  return Object.values(cache).sort((a, b) =>
    b.finalizedAt.localeCompare(a.finalizedAt)
  );
}

export function distributionsForSidai(sidaiId: string): DistributionPackage[] {
  return Object.values(cache)
    .filter((p) => p.sourceSidaiId === sidaiId)
    .sort((a, b) => b.version - a.version);
}

export function listDistributionsFor(
  yearId: string,
  period: Period
): DistributionPackage[] {
  return listDistributions().filter(
    (p) => p.yearId === yearId && p.period === period
  );
}

async function persist(pkg: DistributionPackage): Promise<void> {
  const { error } = await db().from("distributions").upsert({
    id: pkg.id,
    fiscal_year_id: pkg.yearId,
    period: pkg.period,
    name: pkg.name,
    version: pkg.version,
    board: pkg.board,
    occurrence: pkg.occurrence,
    source_sidai_id: pkg.sourceSidaiId,
    finalized_at: pkg.finalizedAt,
    doc: pkg,
  });
  if (error) console.error("[distributionStore] 保存失敗:", error.message);
}

export async function finalizeDistribution(opts: {
  sidaiId: string;
  name: string;
  board: Board;
  occurrence: string;
  /** 議案 id → 確定時点の資料メタ（file_objects の gian scope・元 id のまま） */
  gianFiles: Record<string, { review: GianFileMeta[]; reference: GianFileMeta[] }>;
}): Promise<DistributionPackage | null> {
  const sidai = getSidai(opts.sidaiId);
  if (!sidai) return null;

  const gianIds = Array.from(
    new Set(
      sidai.rows
        .map((r) => r.linkedGianId)
        .filter((v): v is string => typeof v === "string" && v.length > 0)
    )
  );
  const gians = gianIds
    .map((id) => getGianEntry(id)?.gian)
    .filter((g): g is Gian => !!g)
    .map((g) => {
      const frozen = { ...clone(g), status: "locked" as const };
      if (frozen.kind === "基本方針") frozen.priorFeedback = [];
      return frozen;
    });

  const existing = Object.values(cache).filter(
    (p) => p.board === opts.board && p.occurrence === opts.occurrence
  );
  const version = existing.length
    ? Math.max(...existing.map((p) => p.version)) + 1
    : 1;

  const distId = newId("dist");

  // 資料の実体を R2 内で複製し、dist scope の file_objects 行を作る
  const sourceIds: string[] = [];
  for (const cats of Object.values(opts.gianFiles)) {
    for (const m of [...cats.review, ...cats.reference]) sourceIds.push(m.id);
  }
  const gianFiles: DistributionPackage["gianFiles"] = {};
  for (const gid of Object.keys(opts.gianFiles)) {
    gianFiles[gid] = { review: [], reference: [] };
  }
  if (sourceIds.length) {
    const res = await callApi<{
      files: Array<{
        id: string;
        name: string;
        size: number;
        mime: string;
        category: "review" | "reference";
        gianId: string;
      }>;
    }>("/api/files/copy", {
      sourceIds,
      destScope: "dist",
      destOwnerId: distId,
    });
    if (res.ok && res.data) {
      for (const f of res.data.files) {
        const cat: "review" | "reference" =
          f.category === "reference" ? "reference" : "review";
        const meta: GianFileMeta = {
          id: f.id,
          gianId: f.gianId,
          category: cat,
          name: f.name,
          size: f.size,
          type: f.mime,
          addedAt: new Date().toISOString(),
        };
        (gianFiles[f.gianId] ??= { review: [], reference: [] })[cat].push(meta);
      }
    } else {
      console.error("[distributionStore] 資料の凍結コピー失敗:", res.error);
    }
  }

  const pkg: DistributionPackage = {
    id: distId,
    yearId: sidai.yearId,
    period: sidai.period,
    name: opts.name.trim() || `${opts.occurrence}_配信データ`,
    version,
    board: opts.board,
    occurrence: opts.occurrence.trim() || sidai.meetingName,
    finalizedAt: new Date().toISOString(),
    sourceSidaiId: opts.sidaiId,
    sidai: clone(sidai),
    gians,
    gianFiles,
  };

  cache = { ...cache, [pkg.id]: pkg };
  notify();
  await persist(pkg);

  for (const gid of gianIds) lockGian(gid);
  saveSidai(opts.sidaiId, { ...sidai, distributionId: pkg.id });

  return pkg;
}
