"use client";

import { useCallback, useEffect, useState } from "react";
import { FixedFileMeta, listFixedFiles, subscribe } from "./fixedFilesDb";

/** 年度の固定ファイル一覧（IndexedDB・非同期） */
export function useFixedFiles(yearId: string): {
  files: FixedFileMeta[];
  loading: boolean;
  reload: () => void;
} {
  const [files, setFiles] = useState<FixedFileMeta[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    listFixedFiles(yearId)
      .then(setFiles)
      .finally(() => setLoading(false));
  }, [yearId]);

  useEffect(() => {
    setLoading(true);
    reload();
    return subscribe(reload);
  }, [reload]);

  return { files, loading, reload };
}
