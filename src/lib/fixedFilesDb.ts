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
}

function toMeta(f: FileObj): FixedFileMeta {
  return {
    id: f.id,
    yearId: f.ownerId,
    name: f.name,
    type: f.type,
    size: f.size,
    addedAt: f.createdAt,
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
  return (await listFiles("fixed", yearId)).map(toMeta);
}

export async function getFixedFileBlob(
  id: string
): Promise<{ blob: Blob; name: string; type: string } | undefined> {
  return getFileBlobById(id);
}

export async function deleteFixedFile(id: string): Promise<void> {
  await deleteFileObj(id);
}
