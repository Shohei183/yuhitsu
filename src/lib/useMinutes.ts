"use client";

import { useCallback, useEffect, useState } from "react";
import { MinutesFile, listMinutes, subscribe } from "./minutesDb";

/** 年度の議事録一覧（非同期）。 */
export function useMinutes(yearId: string): {
  files: MinutesFile[];
  loading: boolean;
} {
  const [files, setFiles] = useState<MinutesFile[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    if (!yearId) {
      setFiles([]);
      setLoading(false);
      return;
    }
    listMinutes(yearId)
      .then(setFiles)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [yearId]);

  useEffect(() => {
    setLoading(true);
    reload();
    return subscribe(reload);
  }, [reload]);

  return { files, loading };
}
