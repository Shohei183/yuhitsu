"use client";

import { useCallback, useState } from "react";

/**
 * 編集モード。画面を開いた直後は閲覧状態で、「編集開始」を押すと編集できる。
 * 入力は編集中だけ受け付けるので、編集を始めない限り自動保存も走らない。
 * key（議案 id など）が変わると、編集モードは自動で解除される。
 */
export function useEditMode(key: string): {
  editing: boolean;
  start: () => void;
  stop: () => void;
} {
  const [startedKey, setStartedKey] = useState<string | null>(null);
  const start = useCallback(() => setStartedKey(key), [key]);
  const stop = useCallback(() => setStartedKey(null), []);
  return { editing: startedKey === key, start, stop };
}
