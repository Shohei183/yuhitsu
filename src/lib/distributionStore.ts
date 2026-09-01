// ─────────────────────────────────────────────────────────────
// 配信データ（配信確定パッケージ）ストア
//
// 次第作成画面で「配信確定」を押すと、その時点の
//  ・次第（完全コピー）
//  ・次第に紐づく上程済み議案（完全コピー）
//  ・資料一覧（配置ファイルのスナップショット）
// を「配信フォルダ」相当の独立パッケージとして保存する（要件定義書 3.7.1 / 3.4）。
// localStorage のみ（外部接続なし）。
// ─────────────────────────────────────────────────────────────

import { Gian } from "./mockData";
import { getEntry as getGianEntry, lockGian } from "./gianStore";
import { GianFileMeta, getGianFileBlob } from "./gianFilesDb";
import { putDistFile } from "./distFilesDb";
import { Sidai, getSidai, saveSidai } from "./sidaiStore";
import { Period } from "./yearStore";

const LS_KEY = "yuhitsu.distribution-store.v4"; // v3→v4: 資料 Blob を配信データ専用ストアへ凍結コピー

export type Board = "理事会" | "三役会";
export const BOARDS: Board[] = ["理事会", "三役会"];

export interface DistributionPackage {
  id: string;
  /** 所属する年度フォルダ（元の次第から引き継ぐ） */
  yearId: string;
  /** 予定者期間 / 本番期間（元の次第から引き継ぐ） */
  period: Period;
  /** 名称（例：3月度定例理事会_配信データ） */
  name: string;
  /** 版数（1, 2, …） */
  version: number;
  /** 会議体 */
  board: Board;
  /** 回の名称（例：3月度定例理事会） */
  occurrence: string;
  /** 確定日時（ISO） */
  finalizedAt: string;
  /** 元になった次第の id */
  sourceSidaiId: string;
  /** 凍結した次第の完全コピー */
  sidai: Sidai;
  /** 凍結した議案の完全コピー（次第の filelink 行から収集） */
  gians: Gian[];
  /**
   * 凍結時点の資料一覧（議案 id → 審議対象／参考のファイルメタ）。
   * ファイルの実体（Blob）は配信データ専用ストア（distFilesDb）へ凍結コピー済みで、
   * ここの `id` はその distFilesDb 側の id。名前クリックで確定時点のファイルを開ける。
   */
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
let cache: DistributionStore | null = null;
const EMPTY: DistributionStore = {};

function load(): DistributionStore {
  if (cache) return cache;
  if (typeof window === "undefined") {
    cache = EMPTY;
    return cache;
  }
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    cache = raw ? (JSON.parse(raw) as DistributionStore) : {};
  } catch {
    cache = {};
  }
  return cache;
}

const listeners = new Set<() => void>();

function commit(next: DistributionStore): void {
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

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getStore(): DistributionStore {
  return load();
}
export function getStoreDefault(): DistributionStore {
  return EMPTY;
}
export function getDistribution(id: string): DistributionPackage | undefined {
  return load()[id];
}
export function getDistributionDefault(): DistributionPackage | undefined {
  return undefined;
}

/** 確定日時の新しい順 */
export function listDistributions(): DistributionPackage[] {
  return Object.values(load()).sort((a, b) =>
    b.finalizedAt.localeCompare(a.finalizedAt)
  );
}

/**
 * 配信確定：次第＋紐づく議案＋資料一覧を配信パッケージとしてコピー保存する。
 *
 * - パッケージ内はすべて凍結コピー（以後の編集の影響を受けない）。
 * - 元の**議案は完全ロック**する（要件定義書 3.4）。
 * - 元の**次第はロックしない**（出席者数など当日記入する箇所があるため編集を継続できる）。
 * - 同じ会議体・回に既存パッケージがあれば版数を +1（3月度定例理事会_配信データ_v2 …）。
 */
/** 議案資料メタ（元 id）を配信データ専用ストアへ Blob ごとコピーし、新メタ（新 id）を返す */
async function freezeCategory(
  distId: string,
  gianId: string,
  category: "review" | "reference",
  metas: GianFileMeta[]
): Promise<GianFileMeta[]> {
  const out: GianFileMeta[] = [];
  for (const m of metas) {
    const got = await getGianFileBlob(m.id);
    if (!got) {
      // Blob が取れない場合は名前・サイズだけ記録（開けないが履歴は残す）
      out.push(m);
      continue;
    }
    const frozen = await putDistFile(distId, gianId, category, {
      name: got.name,
      type: got.type,
      size: m.size,
      blob: got.blob,
    });
    out.push(frozen);
  }
  return out;
}

export async function finalizeDistribution(opts: {
  sidaiId: string;
  name: string;
  board: Board;
  occurrence: string;
  /** 議案 id → 確定時点の資料メタ（呼び出し側が gianFilesDb から集める・元 id のまま） */
  gianFiles: Record<
    string,
    { review: GianFileMeta[]; reference: GianFileMeta[] }
  >;
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
      // 基本方針は外部配信されるため「前回までの流れ」を凍結コピーから除外する
      if (frozen.kind === "基本方針") frozen.priorFeedback = [];
      return frozen;
    });

  const existing = Object.values(load()).filter(
    (p) => p.board === opts.board && p.occurrence === opts.occurrence
  );
  const version = existing.length
    ? Math.max(...existing.map((p) => p.version)) + 1
    : 1;

  const distId = newId("dist");

  // 資料の実体を配信データ専用ストアへ凍結コピー
  const gianFiles: DistributionPackage["gianFiles"] = {};
  for (const [gid, cats] of Object.entries(opts.gianFiles)) {
    gianFiles[gid] = {
      review: await freezeCategory(distId, gid, "review", cats.review),
      reference: await freezeCategory(distId, gid, "reference", cats.reference),
    };
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

  commit({ ...load(), [pkg.id]: pkg });

  // 収録した議案を完全ロック（配信確定）。次第はロックしない。
  for (const gid of gianIds) lockGian(gid);
  saveSidai(opts.sidaiId, { ...sidai, distributionId: pkg.id });

  return pkg;
}

/** その次第から作られた配信パッケージ（新しい版が先頭） */
export function distributionsForSidai(sidaiId: string): DistributionPackage[] {
  return Object.values(load())
    .filter((p) => p.sourceSidaiId === sidaiId)
    .sort((a, b) => b.version - a.version);
}

/** 指定した年度・期間の配信パッケージ（確定日時の新しい順） */
export function listDistributionsFor(
  yearId: string,
  period: Period
): DistributionPackage[] {
  return listDistributions().filter(
    (p) => p.yearId === yearId && p.period === period
  );
}

/** 動作確認用：配信データを全消去（次第のロックは解除しない） */
export function resetDistributionStore(): void {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(LS_KEY);
    } catch {
      /* noop */
    }
  }
  commit({});
}
