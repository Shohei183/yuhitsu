"use client";

// ─────────────────────────────────────────────────────────────
// 委員会 共有用フォルダのファイル（本番: Supabase file_objects + R2）
// ─────────────────────────────────────────────────────────────

import {
  FileObj,
  listFiles,
  uploadFile,
  deleteFileObj,
  getFileBlobById,
  subscribeFiles,
  MAX_FILE_BYTES as MAX,
} from "./backend/files";

export const MAX_FILE_BYTES = MAX;

export interface SharedFileMeta {
  id: string;
  committeeId: string;
  name: string;
  type: string;
  size: number;
  addedAt: string;
}

function toMeta(f: FileObj): SharedFileMeta {
  return {
    id: f.id,
    committeeId: f.ownerId,
    name: f.name,
    type: f.type,
    size: f.size,
    addedAt: f.createdAt,
  };
}

export const subscribe = subscribeFiles;

export async function putFile(
  committeeId: string,
  file: File
): Promise<SharedFileMeta> {
  return toMeta(await uploadFile("shared", committeeId, file));
}

export async function listByCommittee(
  committeeId: string
): Promise<SharedFileMeta[]> {
  return (await listFiles("shared", committeeId)).map(toMeta);
}

export async function getFileBlob(
  id: string
): Promise<{ blob: Blob; name: string; type: string } | undefined> {
  return getFileBlobById(id);
}

export async function deleteFile(id: string): Promise<void> {
  await deleteFileObj(id);
}

// ── 開く／ダウンロード ──

function isViewable(type: string, name: string): boolean {
  if (/^(application\/pdf|image\/|text\/)/.test(type)) return true;
  return /\.(pdf|png|jpe?g|gif|webp|svg|txt|md|csv)$/i.test(name);
}
function isViewableByName(name: string): boolean {
  return /\.(pdf|png|jpe?g|gif|webp|svg|txt|md|csv)$/i.test(name);
}

export function openFile(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  if (isViewable(blob.type || "", name)) {
    window.open(url, "_blank", "noopener,noreferrer");
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
 * 非同期に Blob を取得して開く（PDF等はタブ、他はダウンロード）。
 * window.open はユーザー操作直後でないとブロックされるため、
 * 表示できそうなファイルはクリック直後に空タブを開いておく。
 */
export function openFileAsync(
  name: string,
  fetchBlob: () => Promise<Blob | null | undefined>
): void {
  // 表示できそうなファイルは、ポップアップブロック回避のためクリック直後に
  // 空タブだけ開いておき（メッセージは出さない）、URL 準備後に差し替える。
  const holder = isViewableByName(name)
    ? window.open("about:blank", "_blank")
    : null;

  fetchBlob()
    .then((blob) => {
      if (!blob) {
        if (holder && !holder.closed) holder.close();
        return;
      }
      const url = URL.createObjectURL(blob);
      if (isViewable(blob.type || "", name)) {
        if (holder && !holder.closed) holder.location.replace(url);
        else window.open(url, "_blank");
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
