"use client";

// ─────────────────────────────────────────────────────────────
// 議事録（本番: Supabase file_objects + R2）
//
//  scope "fixed" に、持ち主 id を `minutes:<次第id>`（会議を選ばない分は `minutes:other:<年度id>`）
//  として保存する。年度の固定ファイル一覧や次第の資料タブには出ない。
// ─────────────────────────────────────────────────────────────

import {
  deleteFileObj,
  listFilesByOwners,
  subscribeFiles,
  uploadFile,
} from "./backend/files";

export interface MinutesFile {
  id: string;
  /** 次第の id、または会議を選ばない分は OTHER 用のキー */
  meetingKey: string;
  name: string;
  type: string;
  size: number;
  addedAt: string;
}

export const subscribe = subscribeFiles;

const PREFIX = "minutes:";
const OTHER = "other:";

export function otherKey(yearId: string): string {
  return `${OTHER}${yearId}`;
}
function ownerOf(meetingKey: string): string {
  return `${PREFIX}${meetingKey}`;
}

export async function putMinutes(
  meetingKey: string,
  file: File
): Promise<void> {
  await uploadFile("fixed", ownerOf(meetingKey), file);
}

export async function deleteMinutes(id: string): Promise<void> {
  await deleteFileObj(id);
}

/** 指定した会議（次第 id / otherKey）の議事録をまとめて取得する。 */
export async function listMinutes(
  meetingKeys: string[]
): Promise<MinutesFile[]> {
  const files = await listFilesByOwners(
    "fixed",
    meetingKeys.map(ownerOf)
  );
  return files.map((f) => ({
    id: f.id,
    meetingKey: f.ownerId.slice(PREFIX.length),
    name: f.name,
    type: f.type,
    size: f.size,
    addedAt: f.createdAt,
  }));
}
