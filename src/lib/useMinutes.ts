"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MinutesFile, listMinutes, subscribe } from "./minutesDb";

/** 指定した会議（次第 id など）の議事録一覧（非同期）。 */
export function useMinutes(meetingKeys: string[]): {
  files: MinutesFile[];
  loading: boolean;
} {
  const [files, setFiles] = useState<MinutesFile[]>([]);
  const [loading, setLoading] = useState(true);
  const joined = meetingKeys.join("\n");
  const keys = useMemo(() => (joined ? joined.split("\n") : []), [joined]);

  const reload = useCallback(() => {
    listMinutes(keys)
      .then(setFiles)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [keys]);

  useEffect(() => {
    reload();
    return subscribe(reload);
  }, [reload]);

  return { files, loading };
}
