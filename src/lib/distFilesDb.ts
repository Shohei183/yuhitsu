// ─────────────────────────────────────────────────────────────
// 配信データに凍結コピーされた資料の実体ストア（IndexedDB）
//
// 配信確定時に、各議案の資料（gianFilesDb の Blob）を「その配信データ専用の
// 凍結コピー」としてこのストアへ複製する。元の議案資料が後から差し替え・削除
// されても、配信データ側は確定時点のファイルをそのまま開ける。
//
// プロトタイプ: 外部ストレージは使わず IndexedDB に保存。
// ─────────────────────────────────────────────────────────────

import { GianFileCategory } from "./gianFilesDb";

const DB_NAME = "yuhitsu-dist-files";
const DB_VERSION = 1;
const STORE = "files";

export interface DistFileMeta {
  id: string;
  distId: string;
  gianId: string;
  category: GianFileCategory;
  name: string;
  type: string;
  size: number;
  addedAt: string;
}

interface DistFileRecord extends DistFileMeta {
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
        os.createIndex("distId", "distId", { unique: false });
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
  return `df-${Date.now().toString(36)}-${seq}`;
}

/** 資料 Blob を配信データ用に 1 件コピー保存。新しい meta（新 id）を返す。 */
export async function putDistFile(
  distId: string,
  gianId: string,
  category: GianFileCategory,
  file: { name: string; type: string; size: number; blob: Blob }
): Promise<DistFileMeta> {
  const record: DistFileRecord = {
    id: newId(),
    distId,
    gianId,
    category,
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
    addedAt: new Date().toISOString(),
    blob: file.blob,
  };
  const store = await tx("readwrite");
  await reqToPromise(store.add(record));
  const { blob: _b, ...meta } = record;
  void _b;
  return meta;
}

export async function getDistFileBlob(
  id: string
): Promise<{ name: string; type: string; blob: Blob } | null> {
  try {
    const store = await tx("readonly");
    const rec = await reqToPromise<DistFileRecord | undefined>(
      store.get(id) as IDBRequest<DistFileRecord | undefined>
    );
    if (!rec) return null;
    return { name: rec.name, type: rec.type, blob: rec.blob };
  } catch {
    return null;
  }
}

/** 動作確認用：配信資料 DB を丸ごと削除 */
export async function resetDistFiles(): Promise<void> {
  dbPromise = null;
  await new Promise<void>((resolve) => {
    if (typeof indexedDB === "undefined") return resolve();
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}
