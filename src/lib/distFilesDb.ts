"use client";

// ─────────────────────────────────────────────────────────────
// 配信データの凍結資料コピー（本番: Supabase file_objects[scope=dist] + R2）
//
// 凍結コピーの作成は distributionStore が /api/files/copy 経由で行う。
// ここでは主に「開く」用の Blob 取得を提供する。
// ─────────────────────────────────────────────────────────────

import {
  FileObj,
  uploadFile,
  getFileBlobById,
  subscribeFiles,
} from "./backend/files";
import type { GianFileCategory } from "./gianFilesDb";

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

function toMeta(f: FileObj): DistFileMeta {
  return {
    id: f.id,
    distId: f.ownerId,
    gianId: f.gianId ?? "",
    category: (f.category ?? "review") as GianFileCategory,
    name: f.name,
    type: f.type,
    size: f.size,
    addedAt: f.createdAt,
  };
}

export const subscribe = subscribeFiles;

/** 単発アップロード（通常は /api/files/copy で複製するので使わない） */
export async function putDistFile(
  distId: string,
  gianId: string,
  category: GianFileCategory,
  data: { name: string; type: string; size: number; blob: Blob }
): Promise<DistFileMeta> {
  const file = new File([data.blob], data.name, { type: data.type });
  return toMeta(await uploadFile("dist", distId, file, { category, gianId }));
}

export async function getDistFileBlob(
  id: string
): Promise<{ blob: Blob; name: string; type: string } | undefined> {
  return getFileBlobById(id);
}
