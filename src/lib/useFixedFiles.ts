"use client";

import { useCallback, useEffect, useState } from "react";
import {
  FixedFileMeta,
  listFixedFiles,
  listSidaiFiles,
  subscribe,
} from "./fixedFilesDb";

/**
 * 年度の固定ファイル一覧（非同期）。sidaiId を渡すと、その次第に直接追加した資料も含める。
 */
export function useFixedFiles(
  yearId: string,
  sidaiId?: string
): {
  files: FixedFileMeta[];
  loading: boolean;
  reload: () => void;
} {
  const [files, setFiles] = useState<FixedFileMeta[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    Promise.all([
      listFixedFiles(yearId),
      sidaiId ? listSidaiFiles(sidaiId) : Promise.resolve([]),
    ])
      .then(([fixed, own]) => setFiles([...fixed, ...own]))
      .finally(() => setLoading(false));
  }, [yearId, sidaiId]);

  useEffect(() => {
    setLoading(true);
    reload();
    return subscribe(reload);
  }, [reload]);

  return { files, loading, reload };
}
