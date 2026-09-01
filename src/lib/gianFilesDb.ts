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

export async function putGianFile(
  gianId: string,
  category: GianFileCategory,
  file: File
): Promise<GianFileMeta> {
  return toMeta(
    await uploadFile("gian", gianId, file, { category, gianId })
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
