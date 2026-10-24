"use client";

import { useSyncExternalStore } from "react";
import { ReplacementRequest } from "./gianStore";
import {
  getDismissed,
  getDismissedDefault,
  subscribe as subscribeDismissed,
} from "./notificationStore";
import { useGianStore } from "./useGianStore";

export interface ReplacementNotice {
  gianId: string;
  gianTopic: string;
  gianKind: string;
  committee: string;
  request: ReplacementRequest;
}

function useDismissed(): string[] {
  return useSyncExternalStore(
    subscribeDismissed,
    getDismissed,
    getDismissedDefault
  );
}

/** 未処理（pending）かつ未クリアの差し替え申請の一覧（新しい順）。yearId 指定でその年度の議案のみ */
export function useReplacementNotifications(yearId?: string): ReplacementNotice[] {
  const store = useGianStore();
  const dismissed = new Set(useDismissed());

  const out: ReplacementNotice[] = [];
  for (const entry of Object.values(store)) {
    // 表示中の年度の議案の申請だけ（他年度の申請は出さない）
    if (yearId && entry.gian.yearId !== yearId) continue;
    for (const req of entry.requests) {
      if (req.status !== "pending") continue;
      if (dismissed.has(req.id)) continue;
      out.push({
        gianId: entry.gian.id,
        gianTopic: entry.gian.topic,
        gianKind: entry.gian.kind,
        committee: entry.gian.committee,
        request: req,
      });
    }
  }
  return out.sort((a, b) =>
    b.request.requestedAt.localeCompare(a.request.requestedAt)
  );
}
