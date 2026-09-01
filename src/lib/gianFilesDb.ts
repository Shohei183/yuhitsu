// ─────────────────────────────────────────────────────────────
// 議案の資料（審議対象資料・参考資料）の実体ストア（IndexedDB）
//
// 共有用フォルダ（sharedFilesDb.ts）と同じ方式。議案ごと・カテゴリごとに
// ファイル実体（Blob）＋メタデータを保存する。
//
// プロトタイプ: 外部ストレージ（Supabase Storage / R2）は使わず IndexedDB に保存。
// ─────────────────────────────────────────────────────────────

const DB_NAME = "yuhitsu-gian-files";
const DB_VERSION = 1;
const STORE = "files";

export const MAX_GIAN_FILE_BYTES = 20 * 1024 * 1024; // 20MB

/** 資料カテゴリ */
export type GianFileCategory = "review" | "reference";

export const GIAN_FILE_CATEGORY_LABEL: Record<GianFileCategory, string> = {
  review: "審議対象資料",
  reference: "参考資料",
};

export interface GianFileMeta {
  id: string;
  gianId: string;
  category: GianFileCategory;
  name: string;
  type: string;
  size: number;
  addedAt: string;
}

interface GianFileRecord extends GianFileMeta {
  blob: Blob;
}

// ── DB オープン ──
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: "id" });
        os.createIndex("gianId", "gianId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return openDb().then((db) => db.transaction(STORE, mode).objectStore(STORE));
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let seq = 0;
function newId(): string {
  seq += 1;
  return `gf-${Date.now().toString(36)}-${seq}`;
}

// ── 変更通知 ──
const listeners = new Set<() => void>();
export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
function notify(): void {
  listeners.forEach((fn) => fn());
}

// ── 操作 ──

export async function putGianFile(
  gianId: string,
  category: GianFileCategory,
  file: File
): Promise<GianFileMeta> {
  if (file.size > MAX_GIAN_FILE_BYTES) {
    throw new Error(
      `ファイルサイズが上限（${Math.round(
        MAX_GIAN_FILE_BYTES / 1024 / 1024
      )}MB）を超えています`
    );
  }
  const record: GianFileRecord = {
    id: newId(),
    gianId,
    category,
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
    addedAt: new Date().toISOString(),
    blob: file,
  };
  const store = await tx("readwrite");
  await reqToPromise(store.add(record));
  notify();
  const { blob: _b, ...meta } = record;
  void _b;
  return meta;
}

async function allForGian(gianId: string): Promise<GianFileRecord[]> {
  try {
    const store = await tx("readonly");
    const idx = store.index("gianId");
    return await reqToPromise<GianFileRecord[]>(
      idx.getAll(gianId) as IDBRequest<GianFileRecord[]>
    );
  } catch {
    return [];
  }
}

export async function listGianFiles(
  gianId: string,
  category: GianFileCategory
): Promise<GianFileMeta[]> {
  const recs = await allForGian(gianId);
  return recs
    .filter((r) => r.category === category)
    .map(({ blob: _b, ...meta }) => {
      void _b;
      return meta;
    })
    .sort((a, b) => a.addedAt.localeCompare(b.addedAt));
}

/** その議案の全カテゴリのファイル（メタのみ） */
export async function listAllGianFiles(
  gianId: string
): Promise<{ review: GianFileMeta[]; reference: GianFileMeta[] }> {
  const recs = await allForGian(gianId);
  const meta = recs.map(({ blob: _b, ...m }) => {
    void _b;
    return m;
  });
  const byCat = (c: GianFileCategory) =>
    meta
      .filter((m) => m.category === c)
      .sort((a, b) => a.addedAt.localeCompare(b.addedAt));
  return { review: byCat("review"), reference: byCat("reference") };
}

export async function getGianFileBlob(
  id: string
): Promise<{ name: string; type: string; blob: Blob } | null> {
  try {
    const store = await tx("readonly");
    const rec = await reqToPromise<GianFileRecord | undefined>(
      store.get(id) as IDBRequest<GianFileRecord | undefined>
    );
    if (!rec) return null;
    return { name: rec.name, type: rec.type, blob: rec.blob };
  } catch {
    return null;
  }
}

export async function deleteGianFile(id: string): Promise<void> {
  const store = await tx("readwrite");
  await reqToPromise(store.delete(id));
  notify();
}

/** 動作確認用：議案資料 DB を丸ごと削除 */
export async function resetGianFiles(): Promise<void> {
  dbPromise = null;
  await new Promise<void>((resolve) => {
    if (typeof indexedDB === "undefined") return resolve();
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
  notify();
}
