"use client";

// ─────────────────────────────────────────────────────────────
// ファイル共通レイヤー（file_objects テーブル + R2）
//
// 4 種のファイルストア（shared / gian / fixed / dist）の共通実装。
// 各 *FilesDb.ts はこの薄いラッパー。
// ─────────────────────────────────────────────────────────────

import { db, authedFetch, callApi } from "./client";

export type FileScope = "shared" | "gian" | "fixed" | "dist" | "budget";

export interface FileObj {
  id: string;
  scope: FileScope;
  ownerId: string;
  gianId: string | null;
  category: "review" | "reference" | null;
  name: string;
  size: number;
  type: string;
  createdAt: string;
}

type FileRow = {
  id: string;
  scope: FileScope;
  owner_id: string;
  gian_id: string | null;
  category: "review" | "reference" | null;
  name: string;
  size: number;
  mime: string;
  r2_key: string;
  created_at: string;
};

function fromRow(r: FileRow): FileObj {
  return {
    id: r.id,
    scope: r.scope,
    ownerId: r.owner_id,
    gianId: r.gian_id,
    category: r.category,
    name: r.name,
    size: r.size,
    type: r.mime,
    createdAt: r.created_at,
  };
}

// ── 購読（アップロード／削除でUIを更新するため）──
const listeners = new Set<() => void>();
export function subscribeFiles(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function notifyFiles(): void {
  listeners.forEach((fn) => fn());
}

// ── 一覧 ──
export async function listFiles(
  scope: FileScope,
  ownerId: string,
  category?: "review" | "reference"
): Promise<FileObj[]> {
  if (!ownerId) return [];
  let q = db().from("file_objects").select("*").eq("scope", scope).eq("owner_id", ownerId);
  if (category) q = q.eq("category", category);
  const { data, error } = await q;
  if (error) {
    console.error("[files] listFiles 失敗:", error.message);
    return [];
  }
  return ((data ?? []) as FileRow[])
    .map(fromRow)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

// ── アップロード ──
// サイズ上限は撤廃（表示用の目安値のみ残す）。R2 の単一 PUT は最大 5GB。
export const MAX_FILE_BYTES = 5 * 1024 * 1024 * 1024;

export async function uploadFile(
  scope: FileScope,
  ownerId: string,
  file: File,
  opts: { category?: "review" | "reference"; gianId?: string } = {}
): Promise<FileObj> {
  const mime = file.type || "application/octet-stream";
  const presign = await callApi<{ fileId: string; r2Key: string; uploadUrl: string }>(
    "/api/files/presign-upload",
    { scope, ownerId, name: file.name, mime }
  );
  if (!presign.ok || !presign.data) {
    throw new Error(presign.error || "アップロードURLの取得に失敗しました");
  }
  const { fileId, r2Key, uploadUrl } = presign.data;

  const put = await fetch(uploadUrl, {
    method: "PUT",
    body: file,
    headers: { "content-type": mime },
  });
  if (!put.ok) throw new Error(`アップロードに失敗しました (${put.status})`);

  const row = {
    id: fileId,
    scope,
    owner_id: ownerId,
    gian_id: opts.gianId ?? null,
    category: opts.category ?? null,
    name: file.name,
    size: file.size,
    mime,
    r2_key: r2Key,
  };
  const { error } = await db().from("file_objects").insert(row);
  if (error) throw new Error(error.message);

  notifyFiles();
  return fromRow({ ...row, created_at: new Date().toISOString() } as FileRow);
}

// ── 削除 ──
export async function deleteFileObj(id: string): Promise<void> {
  const res = await authedFetch(`/api/files/${id}`, { method: "DELETE" });
  if (!res.ok) console.error("[files] 削除失敗:", res.status);
  notifyFiles();
}

// ── URL / Blob 取得 ──
export async function getFileUrl(
  id: string,
  opts: { download?: boolean } = {}
): Promise<{ url: string; name: string } | null> {
  const path = `/api/files/${id}${opts.download ? "?download=1" : ""}`;
  const res = await authedFetch(path, { method: "GET" });
  if (!res.ok) return null;
  const json = (await res.json()) as { url?: string; name?: string };
  if (!json.url) return null;
  return { url: json.url, name: json.name ?? "download" };
}

export async function getFileBlobById(
  id: string
): Promise<{ blob: Blob; name: string; type: string } | undefined> {
  const got = await getFileUrl(id);
  if (!got) return undefined;
  const r = await fetch(got.url);
  if (!r.ok) return undefined;
  const blob = await r.blob();
  return { blob, name: got.name, type: blob.type };
}

function isViewableName(name: string): boolean {
  return /\.(pdf|png|jpe?g|gif|webp|svg|txt|md|csv)$/i.test(name);
}

/**
 * ファイルを開く（R2 の署名付き URL に直接遷移。Blob 経由の二重転送なし）。
 * PDF・画像・テキストは新タブでインライン表示、他はダウンロード。
 * ポップアップブロック回避のため、クリック直後に空タブを開いておく。
 */
export function openFileByIdAsync(id: string, name: string): void {
  const viewable = isViewableName(name);
  const holder = viewable ? window.open("about:blank", "_blank") : null;

  getFileUrl(id, { download: !viewable })
    .then((got) => {
      if (!got) {
        if (holder && !holder.closed) holder.close();
        return;
      }
      if (viewable) {
        if (holder && !holder.closed) holder.location.replace(got.url);
        else window.open(got.url, "_blank");
      } else {
        const a = document.createElement("a");
        a.href = got.url;
        a.download = name;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    })
    .catch(() => {
      if (holder && !holder.closed) holder.close();
    });
}

/** ダウンロード（添付保存）専用 */
export function downloadFileByIdAsync(id: string, name: string): void {
  getFileUrl(id, { download: true }).then((got) => {
    if (!got) return;
    const a = document.createElement("a");
    a.href = got.url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  });
}
