"use client";

import { useCallback, useEffect, useState } from "react";
import {
  FixedFileMeta,
  listFixedFiles,
  listSidaiFiles,
  subscribe,
} from "./fixedFilesDb";
import { listMinutes } from "./minutesDb";

/**
 * 年度の固定ファイル一覧（非同期）。sidaiId を渡すと、その次第に直接追加した資料と
 * 議事録フォルダの議事録も含める（次第のファイルリンク用）。
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
      sidaiId ? listMinutes(yearId) : Promise.resolve([]),
    ])
      .then(([fixed, own, minutes]) =>
        setFiles([
          ...fixed,
          ...own,
          ...minutes.map((m) => ({
            id: m.id,
            yearId,
            name: m.name,
            type: m.type,
            size: m.size,
            addedAt: m.addedAt,
            minutes: true,
          })),
        ])
      )
      .finally(() => setLoading(false));
  }, [yearId, sidaiId]);

  useEffect(() => {
    setLoading(true);
    reload();
    return subscribe(reload);
  }, [reload]);

  return { files, loading, reload };
}
