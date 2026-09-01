// ─────────────────────────────────────────────────────────────
// 固定ファイル（年度フォルダ）の実体ストア（IndexedDB）
//
// 共有用フォルダ（sharedFilesDb）・議案資料（gianFilesDb）と同じ方式。
// 年度ごとに、規約・議事法・スローガン・テンプレート等のファイル実体（Blob）を保存する。
//
// プロトタイプ: 外部ストレージ（Supabase Storage / R2）は使わず IndexedDB に保存。
// ─────────────────────────────────────────────────────────────

const DB_NAME = "yuhitsu-fixed-files";
const DB_VERSION = 1;
const STORE = "files";

export const MAX_FIXED_FILE_BYTES = 20 * 1024 * 1024; // 20MB

export interface FixedFileMeta {
  id: string;
  yearId: string;
  name: string;
  type: string;
  size: number;
  addedAt: string;
}

interface FixedFileRecord extends FixedFileMeta {
  blob: Blob;
}

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
        os.createIndex("yearId", "yearId", { unique: false });
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
  return `ff-${Date.now().toString(36)}-${seq}`;
}

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

export async function putFixedFile(
  yearId: string,
  file: File
): Promise<FixedFileMeta> {
  if (file.size > MAX_FIXED_FILE_BYTES) {
    throw new Error(
      `ファイルサイズが上限（${Math.round(
        MAX_FIXED_FILE_BYTES / 1024 / 1024
      )}MB）を超えています`
    );
  }
  const record: FixedFileRecord = {
    id: newId(),
    yearId,
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

export async function listFixedFiles(yearId: string): Promise<FixedFileMeta[]> {
  try {
    const store = await tx("readonly");
    const idx = store.index("yearId");
    const recs = await reqToPromise<FixedFileRecord[]>(
      idx.getAll(yearId) as IDBRequest<FixedFileRecord[]>
    );
    return recs
      .map(({ blob: _b, ...m }) => {
        void _b;
        return m;
      })
      .sort((a, b) => a.addedAt.localeCompare(b.addedAt));
  } catch {
    return [];
  }
}

export async function getFixedFileBlob(
  id: string
): Promise<{ name: string; type: string; blob: Blob } | null> {
  try {
    const store = await tx("readonly");
    const rec = await reqToPromise<FixedFileRecord | undefined>(
      store.get(id) as IDBRequest<FixedFileRecord | undefined>
    );
    if (!rec) return null;
    return { name: rec.name, type: rec.type, blob: rec.blob };
  } catch {
    return null;
  }
}

export async function deleteFixedFile(id: string): Promise<void> {
  const store = await tx("readwrite");
  await reqToPromise(store.delete(id));
  notify();
}

export async function resetFixedFiles(): Promise<void> {
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
