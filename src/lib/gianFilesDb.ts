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

/** Gian.fileRed のキー（資料のコピーで id が変わっても保てるよう区分＋名前） */
export function fileRedKey(category: GianFileCategory, name: string): string {
  return `${category}:${name}`;
}

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

const nameCollator = new Intl.Collator("ja", { numeric: true });

/** 全角数字などを半角にそろえ、先頭の「審議／参考／資料」の語を除く（並べ替え用） */
function sortableName(name: string): string {
  return name
    .normalize("NFKC")
    .trim()
    .replace(/^(?:審議|参考|審|参)?\s*(?:資料)?\s*/, "");
}

/**
 * ファイル名の先頭にある資料番号を読む（「審議1-…」「審1_…」「参考資料2」「1. …」など。全角数字も可）。
 * 無ければ null。表示時の並べ替えに使う（リネームはしない）。
 */
export function resourceNo(name: string): number | null {
  const m = sortableName(name).match(/^(\d+)/);
  return m ? Number(m[1]) : null;
}

/**
 * 資料の並び順：ファイル名の資料番号 昇順（1-2 は 1-10 より前）。
 * 番号なしは末尾で、その中はファイル名順。
 */
export function compareResourceName(a: string, b: string): number {
  const na = resourceNo(a);
  const nb = resourceNo(b);
  if (na != null && nb == null) return -1;
  if (na == null && nb != null) return 1;
  return nameCollator.compare(sortableName(a), sortableName(b));
}

/** 資料をファイル名の番号順に並べた新しい配列 */
export function sortResources<T extends { name: string }>(files: T[]): T[] {
  return [...files].sort((a, b) => compareResourceName(a.name, b.name));
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
  return sortResources((await listFiles("gian", gianId, category)).map(toMeta));
}

export async function listAllGianFiles(
  gianId: string
): Promise<{ review: GianFileMeta[]; reference: GianFileMeta[] }> {
  const all = sortResources((await listFiles("gian", gianId)).map(toMeta));
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
