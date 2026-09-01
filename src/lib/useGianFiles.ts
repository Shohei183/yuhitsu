"use client";

import { useCallback, useEffect, useState } from "react";
import {
  GianFileCategory,
  GianFileMeta,
  listGianFiles,
  subscribe,
} from "./gianFilesDb";

/** 議案の 1 カテゴリの資料ファイル一覧（IndexedDB・非同期） */
export function useGianFiles(
  gianId: string,
  category: GianFileCategory
): { files: GianFileMeta[]; loading: boolean; reload: () => void } {
  const [files, setFiles] = useState<GianFileMeta[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    listGianFiles(gianId, category)
      .then(setFiles)
      .finally(() => setLoading(false));
  }, [gianId, category]);

  useEffect(() => {
    setLoading(true);
    reload();
    return subscribe(reload);
  }, [reload]);

  return { files, loading, reload };
}
