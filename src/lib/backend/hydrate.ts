"use client";

// ─────────────────────────────────────────────────────────────
// 全ストアのハイドレーション（起動時 / 再ログイン時に呼ぶ）
// 移行が進むごとにここへ追加していく。
// ─────────────────────────────────────────────────────────────

import { takeHydrateFailures } from "@/lib/backend/client";
import { hydrate as hydrateMembers } from "@/lib/memberStore";
import { hydrate as hydrateYears } from "@/lib/yearStore";
import { hydrate as hydrateRolePerms } from "@/lib/rolePermStore";
import { hydrate as hydrateTemplates } from "@/lib/templateStore";
import { hydrate as hydrateSettings } from "@/lib/settingsStore";
import { hydrate as hydrateGians } from "@/lib/gianStore";
import { hydrate as hydrateSidais } from "@/lib/sidaiStore";
import { hydrate as hydrateDistributions } from "@/lib/distributionStore";
import { hydrate as hydrateBudgets } from "@/lib/budgetStore";
import { hydrate as hydrateJotei } from "@/lib/joteiStore";
import { hydrate as hydrateReviewNotes } from "@/lib/reviewNoteStore";
import { hydrate as hydrateCommitteeReports } from "@/lib/committeeReportStore";

let inflight: Promise<void> | null = null;

/** 1回の読み込みを待つ上限。応答が止まったままでも、再試行できるようにする */
const HYDRATE_TIMEOUT_MS = 30_000;

/**
 * 全ストアを読み込む。一部でも読めなかった場合・時間切れの場合は例外を投げる
 * （空のまま画面を出さず、呼び出し側が再試行できるようにする）。
 */
export async function hydrateAll(): Promise<void> {
  if (inflight) return inflight;
  takeHydrateFailures();
  const load = (async () => {
    // members / years / roleperm / templates を先に（権限・組織の土台）
    await Promise.all([
      hydrateMembers(),
      hydrateYears(),
      hydrateRolePerms(),
      hydrateTemplates(),
      hydrateSettings(),
    ]);
    // 続いてドキュメント類
    await Promise.all([
      hydrateGians(),
      hydrateSidais(),
      hydrateDistributions(),
      hydrateBudgets(),
      hydrateJotei(),
      hydrateReviewNotes(),
      hydrateCommitteeReports(),
    ]);
    if (takeHydrateFailures() > 0) {
      throw new Error("一部のデータを読み込めませんでした");
    }
  })();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("読み込みに時間がかかっています")),
      HYDRATE_TIMEOUT_MS
    );
  });
  inflight = Promise.race([load, timeout]);
  try {
    await inflight;
  } finally {
    clearTimeout(timer);
    inflight = null;
    load.catch(() => {}); // 時間切れ後に遅れて失敗しても未処理エラーにしない
  }
}
