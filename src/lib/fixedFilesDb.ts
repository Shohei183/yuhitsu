"use client";

// ─────────────────────────────────────────────────────────────
// 年度フォルダの固定ファイル（本番: Supabase file_objects + R2）
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

export const MAX_FIXED_FILE_BYTES = MAX;

export interface FixedFileMeta {
  id: string;
  yearId: string;
  name: string;
  type: string;
  size: number;
  addedAt: string;
  /** 次第に直接追加した資料（年度の固定ファイルではない） */
  sidaiOwned?: boolean;
}

function toMeta(f: FileObj, sidaiOwned = false): FixedFileMeta {
  return {
    id: f.id,
    yearId: f.ownerId,
    name: f.name,
    type: f.type,
    size: f.size,
    addedAt: f.createdAt,
    ...(sidaiOwned ? { sidaiOwned: true } : {}),
  };
}

export const subscribe = subscribeFiles;

export async function putFixedFile(
  yearId: string,
  file: File
): Promise<FixedFileMeta> {
  return toMeta(await uploadFile("fixed", yearId, file));
}

export async function listFixedFiles(yearId: string): Promise<FixedFileMeta[]> {
  return (await listFiles("fixed", yearId)).map((f) => toMeta(f));
}

export async function getFixedFileBlob(
  id: string
): Promise<{ blob: Blob; name: string; type: string } | undefined> {
  return getFileBlobById(id);
}

export async function deleteFixedFile(id: string): Promise<void> {
  await deleteFileObj(id);
}

// ── 次第に直接追加する資料（議事録など、その次第だけで使うファイル） ──
//   固定ファイル一覧には出さないよう、年度ではなく次第の id を持ち主にして保存する。

export async function putSidaiFile(
  sidaiId: string,
  file: File
): Promise<FixedFileMeta> {
  return toMeta(await uploadFile("fixed", sidaiId, file), true);
}

export async function listSidaiFiles(sidaiId: string): Promise<FixedFileMeta[]> {
  return (await listFiles("fixed", sidaiId)).map((f) => toMeta(f, true));
}
