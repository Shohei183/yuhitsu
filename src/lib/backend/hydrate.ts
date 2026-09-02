"use client";

// ─────────────────────────────────────────────────────────────
// 全ストアのハイドレーション（起動時 / 再ログイン時に呼ぶ）
// 移行が進むごとにここへ追加していく。
// ─────────────────────────────────────────────────────────────

import { hydrate as hydrateMembers } from "@/lib/memberStore";
import { hydrate as hydrateYears } from "@/lib/yearStore";
import { hydrate as hydrateRolePerms } from "@/lib/rolePermStore";
import { hydrate as hydrateTemplates } from "@/lib/templateStore";
import { hydrate as hydrateGians } from "@/lib/gianStore";
import { hydrate as hydrateSidais } from "@/lib/sidaiStore";
import { hydrate as hydrateDistributions } from "@/lib/distributionStore";
import { hydrate as hydrateBudgets } from "@/lib/budgetStore";
import { hydrate as hydrateJotei } from "@/lib/joteiStore";
import { hydrate as hydrateReviewNotes } from "@/lib/reviewNoteStore";

let inflight: Promise<void> | null = null;

export async function hydrateAll(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    // members / years / roleperm / templates を先に（権限・組織の土台）
    await Promise.all([
      hydrateMembers(),
      hydrateYears(),
      hydrateRolePerms(),
      hydrateTemplates(),
    ]);
    // 続いてドキュメント類
    await Promise.all([
      hydrateGians(),
      hydrateSidais(),
      hydrateDistributions(),
      hydrateBudgets(),
      hydrateJotei(),
      hydrateReviewNotes(),
    ]);
  })();
  try {
    await inflight;
  } finally {
    inflight = null;
  }
}
