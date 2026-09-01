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

/** 未処理（pending）かつ未クリアの差し替え申請の一覧（新しい順） */
export function useReplacementNotifications(): ReplacementNotice[] {
  const store = useGianStore();
  const dismissed = new Set(useDismissed());

  const out: ReplacementNotice[] = [];
  for (const entry of Object.values(store)) {
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
