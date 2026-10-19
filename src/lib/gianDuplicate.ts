"use client";

// 議案の複製（本文＋予算書＋審議対象資料／参考資料）。
// 本文は gianStore.duplicateGian が即座に複製し、予算書・資料ファイルはその後に非同期で複製する。

import { duplicateGian, getEntry } from "./gianStore";
import { GianKind } from "./mockData";
import { budgetForGian, duplicateBudget } from "./budgetStore";
import { listAllGianFiles } from "./gianFilesDb";
import { copyFileObjs } from "./backend/files";

export function duplicateGianWithAttachments(
  sourceId: string,
  targetKind?: GianKind
): string | null {
  const newId = duplicateGian(sourceId, targetKind);
  if (!newId) return null;
  void copyAttachments(sourceId, newId);
  return newId;
}

async function copyAttachments(sourceId: string, newId: string): Promise<void> {
  try {
    // 審議対象資料・参考資料（元の category を保ったまま複製）
    const files = await listAllGianFiles(sourceId);
    const ids = [...files.review, ...files.reference].map((f) => f.id);
    if (ids.length > 0) await copyFileObjs(ids, "gian", newId);
  } catch (e) {
    console.error("[議案複製] 資料の複製に失敗:", e);
  }
  try {
    // 事業収支予算書
    const budget = budgetForGian(sourceId);
    if (budget) {
      await duplicateBudget(budget.id, {
        gianId: newId,
        title: getEntry(newId)?.gian.topic ?? budget.title,
      });
    }
  } catch (e) {
    console.error("[議案複製] 予算書の複製に失敗:", e);
  }
}
