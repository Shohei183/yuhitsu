"use client";

// ─────────────────────────────────────────────────────────────
// 議案の資料（審議対象／参考）（本番: Supabase file_objects + R2）
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

export const MAX_GIAN_FILE_BYTES = MAX;

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

function toMeta(f: FileObj): GianFileMeta {
  return {
    id: f.id,
    gianId: f.gianId ?? f.ownerId,
    category: (f.category ?? "review") as GianFileCategory,
    name: f.name,
    type: f.type,
    size: f.size,
    addedAt: f.createdAt,
  };
}

export const subscribe = subscribeFiles;

/**
 * ファイル名の先頭にある資料番号を読む（「審議1-…」「審1_…」「1. …」など）。
 * 無ければ null。表示時の並べ替えに使う（リネームはしない）。
 */
export function resourceNo(name: string): number | null {
  const m = name.match(/^\s*(?:審議|参考|審|参)?\s*(\d+)/);
  return m ? Number(m[1]) : null;
}

/** 資料番号 昇順（番号なしは末尾・その中は元の順） */
function byResourceNo(a: GianFileMeta, b: GianFileMeta): number {
  const na = resourceNo(a.name);
  const nb = resourceNo(b.name);
  if (na != null && nb != null) return na - nb;
  if (na != null) return -1;
  if (nb != null) return 1;
  return a.addedAt.localeCompare(b.addedAt);
}

export async function putGianFile(
  gianId: string,
  category: GianFileCategory,
  file: File
): Promise<GianFileMeta> {
  // リネームはしない。ファイル名の番号は表示時に読み取って並べ替えるだけ。
  return toMeta(
    await uploadFile("gian", gianId, file, { category, gianId })
  );
}

export async function listGianFiles(
  gianId: string,
  category: GianFileCategory
): Promise<GianFileMeta[]> {
  return (await listFiles("gian", gianId, category)).map(toMeta).sort(byResourceNo);
}

export async function listAllGianFiles(
  gianId: string
): Promise<{ review: GianFileMeta[]; reference: GianFileMeta[] }> {
  const all = (await listFiles("gian", gianId)).map(toMeta).sort(byResourceNo);
  return {
    review: all.filter((f) => f.category === "review"),
    reference: all.filter((f) => f.category === "reference"),
  };
}

export async function getGianFileBlob(
  id: string
): Promise<{ blob: Blob; name: string; type: string } | undefined> {
  return getFileBlobById(id);
}

export async function deleteGianFile(id: string): Promise<void> {
  await deleteFileObj(id);
}
