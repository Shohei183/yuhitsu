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

/** 資料のファイル名プレフィックス（種類を表す記号＋番号） */
const NAME_PREFIX: Record<GianFileCategory, string> = {
  review: "審議",
  reference: "参考",
};
/** 既存プレフィックス（審 / 審議 / 参 / 参考 ＋ 数字 ＋ 区切り）を落とす */
const PREFIX_RE = /^\s*(?:審議|参考|審|参)\s*\d+\s*[-__.\s]+/;

function prefixedName(
  category: GianFileCategory,
  original: string,
  existing: GianFileMeta[]
): string {
  const title = original.replace(PREFIX_RE, "").trim() || original;
  const pfx = NAME_PREFIX[category];
  const used = existing
    .map((f) => {
      const m = f.name.match(/^(?:審議|参考|審|参)\s*(\d+)/);
      return m ? Number(m[1]) : 0;
    })
    .filter((n) => n > 0);
  const next = (used.length ? Math.max(...used) : 0) + 1;
  return `${pfx}${next}-${title}`;
}

export async function putGianFile(
  gianId: string,
  category: GianFileCategory,
  file: File
): Promise<GianFileMeta> {
  // 「審議N-タイトル」「参考N-タイトル」に自動リネームして保存
  const existing = await listGianFiles(gianId, category);
  const newName = prefixedName(category, file.name, existing);
  const renamed =
    newName === file.name ? file : new File([file], newName, { type: file.type });
  return toMeta(
    await uploadFile("gian", gianId, renamed, { category, gianId })
  );
}

export async function listGianFiles(
  gianId: string,
  category: GianFileCategory
): Promise<GianFileMeta[]> {
  return (await listFiles("gian", gianId, category)).map(toMeta);
}

export async function listAllGianFiles(
  gianId: string
): Promise<{ review: GianFileMeta[]; reference: GianFileMeta[] }> {
  const all = (await listFiles("gian", gianId)).map(toMeta);
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
