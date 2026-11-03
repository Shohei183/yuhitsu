"use client";

// ─────────────────────────────────────────────────────────────
// 議事録（本番: Supabase file_objects + R2）
//
//  scope "fixed" に、持ち主 id を `minutes:<年度id>` として保存する。
//  年度の固定ファイル一覧や次第の資料タブには出ない。
// ─────────────────────────────────────────────────────────────

import {
  deleteFileObj,
  listFiles,
  subscribeFiles,
  uploadFile,
} from "./backend/files";

export interface MinutesFile {
  id: string;
  name: string;
  type: string;
  size: number;
  addedAt: string;
}

export const subscribe = subscribeFiles;

function ownerOf(yearId: string): string {
  return `minutes:${yearId}`;
}

export async function putMinutes(yearId: string, file: File): Promise<void> {
  await uploadFile("fixed", ownerOf(yearId), file);
}

export async function deleteMinutes(id: string): Promise<void> {
  await deleteFileObj(id);
}

/** 年度に提出された議事録（新しい順）。 */
export async function listMinutes(yearId: string): Promise<MinutesFile[]> {
  const files = await listFiles("fixed", ownerOf(yearId));
  return files
    .map((f) => ({
      id: f.id,
      name: f.name,
      type: f.type,
      size: f.size,
      addedAt: f.createdAt,
    }))
    .sort((a, b) => b.addedAt.localeCompare(a.addedAt));
}
