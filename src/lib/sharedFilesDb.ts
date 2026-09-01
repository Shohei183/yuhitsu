// ─────────────────────────────────────────────────────────────
// 共有用フォルダのファイル実体ストア（IndexedDB）
//
// 要件定義書 3.8：共有用フォルダは議案システムの厳密な管理（ID・タグ・
// スナップショット）の対象外＝単純なファイル置き場。
//
// プロトタイプ: 外部ストレージ（Supabase Storage / R2）は使わず、
// ブラウザの IndexedDB にファイル実体（Blob）ごと保存する。
// メタデータ（名前・サイズ・日時）も同じレコードに持つ。
// ─────────────────────────────────────────────────────────────

const DB_NAME = "yuhitsu-shared-files";
const DB_VERSION = 1;
const STORE = "files";

/** 1 ファイルあたりの上限（プロトタイプ用の目安） */
export const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB

export interface SharedFileMeta {
  id: string;
  committeeId: string;
  name: string;
  type: string;
  size: number;
  addedAt: string;
}

interface SharedFileRecord extends SharedFileMeta {
  blob: Blob;
}

// ── DB オープン（1 回だけ） ──
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
        os.createIndex("committeeId", "committeeId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(
  mode: IDBTransactionMode
): Promise<IDBObjectStore> {
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
  return `shf-${Date.now().toString(36)}-${seq}`;
}

// ── 変更通知（フックの再読込用） ──
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

/** ファイルを 1 件保存 */
export async function putFile(
  committeeId: string,
  file: File
): Promise<SharedFileMeta> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(
      `ファイルサイズが上限（${Math.round(MAX_FILE_BYTES / 1024 / 1024)}MB）を超えています`
    );
  }
  const record: SharedFileRecord = {
    id: newId(),
    committeeId,
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
    addedAt: new Date().toISOString(),
    blob: file,
  };
  const store = await tx("readwrite");
  await reqToPromise(store.add(record));
  notify();
  const { blob: _blob, ...meta } = record;
  void _blob;
  return meta;
}

/** その委員会のファイル一覧（メタのみ・新しい順） */
export async function listByCommittee(
  committeeId: string
): Promise<SharedFileMeta[]> {
  try {
    const store = await tx("readonly");
    const idx = store.index("committeeId");
    const records = await reqToPromise<SharedFileRecord[]>(
      idx.getAll(committeeId) as IDBRequest<SharedFileRecord[]>
    );
    return records
      .map(({ blob: _b, ...meta }) => {
        void _b;
        return meta;
      })
      .sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  } catch {
    return [];
  }
}

/** ダウンロード用に Blob を取り出す */
export async function getFileBlob(
  id: string
): Promise<{ name: string; type: string; blob: Blob } | null> {
  try {
    const store = await tx("readonly");
    const rec = await reqToPromise<SharedFileRecord | undefined>(
      store.get(id) as IDBRequest<SharedFileRecord | undefined>
    );
    if (!rec) return null;
    return { name: rec.name, type: rec.type, blob: rec.blob };
  } catch {
    return null;
  }
}

export async function deleteFile(id: string): Promise<void> {
  const store = await tx("readwrite");
  await reqToPromise(store.delete(id));
  notify();
}

/** 動作確認用：共有ファイル DB を丸ごと削除 */
export async function resetSharedFiles(): Promise<void> {
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

/** ブラウザで表示できる形式か（PDF・画像・テキスト） */
function isViewable(type: string, name: string): boolean {
  if (/^(application\/pdf|image\/|text\/)/.test(type)) return true;
  return /\.(pdf|png|jpe?g|gif|webp|svg|txt|md|csv)$/i.test(name);
}

/** 名前（拡張子）だけでブラウザ表示できそうか判定（Blob 取得前の同期判定用） */
function isViewableByName(name: string): boolean {
  return /\.(pdf|png|jpe?g|gif|webp|svg|txt|md|csv)$/i.test(name);
}

/**
 * Blob を開く。ブラウザで表示できる形式（PDF・画像・テキスト）は新しいタブで開き、
 * それ以外はダウンロードする（＝PDF はローカルに保存しない）。
 */
export function openFile(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  if (isViewable(blob.type || "", name)) {
    window.open(url, "_blank", "noopener,noreferrer");
    // タブが読み込み終わるまで URL を保持
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } else {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/**
 * IndexedDB などから非同期に Blob を取得して開く。
 *
 * `window.open()` は「ユーザー操作の直後」でないとポップアップブロックされるため、
 * `await` の後に呼ぶと新しいタブが開かない（＝資料リンクが飛ばない不具合の原因）。
 * ここでは表示できそうなファイルはクリック直後に空タブを開いておき、
 * Blob が用意できてからそのタブへ URL を流し込む。
 *
 * ※ `window.open(..., "noopener")` は戻り値が null になり参照を保持できないため、
 *   ホルダータブを開くときは noopener を付けない（自前の blob: URL なので安全）。
 */
export function openFileAsync(
  name: string,
  fetchBlob: () => Promise<Blob | null | undefined>
): void {
  const holder = isViewableByName(name)
    ? window.open("about:blank", "_blank")
    : null;
  if (holder) {
    try {
      holder.document.write(
        '<!doctype html><meta charset="utf-8"><title>読み込み中…</title>' +
          '<body style="font:14px/1.6 system-ui,sans-serif;padding:24px;color:#555">' +
          "資料を読み込んでいます…</body>"
      );
      holder.document.close();
    } catch {
      /* noop */
    }
  }

  fetchBlob()
    .then((blob) => {
      if (!blob) {
        if (holder && !holder.closed) holder.close();
        return;
      }
      const url = URL.createObjectURL(blob);
      if (isViewable(blob.type || "", name)) {
        if (holder && !holder.closed) {
          holder.location.replace(url);
        } else {
          window.open(url, "_blank");
        }
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        if (holder && !holder.closed) holder.close();
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    })
    .catch(() => {
      if (holder && !holder.closed) holder.close();
    });
}
