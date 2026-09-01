"use client";

import { useCallback, useEffect, useState } from "react";
import {
  SharedFileMeta,
  listByCommittee,
  subscribe,
} from "./sharedFilesDb";

/**
 * 委員会の共有用フォルダのファイル一覧（IndexedDB）。
 * 非同期読み込み＋変更通知で再取得する。
 */
export function useSharedFiles(committeeId: string): {
  files: SharedFileMeta[];
  loading: boolean;
  reload: () => void;
} {
  const [files, setFiles] = useState<SharedFileMeta[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    listByCommittee(committeeId)
      .then(setFiles)
      .finally(() => setLoading(false));
  }, [committeeId]);

  useEffect(() => {
    setLoading(true);
    reload();
    const unsub = subscribe(reload);
    return unsub;
  }, [reload]);

  return { files, loading, reload };
}
