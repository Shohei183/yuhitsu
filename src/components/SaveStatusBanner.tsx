"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  getSaveStatus,
  getSaveStatusServer,
  retrySavesNow,
  subscribeSaveStatus,
} from "@/lib/backend/saveQueue";
import styles from "./SaveStatusBanner.module.css";

/**
 * 保存が DB に届いていないときに、画面の下に知らせる（自動でやり直している）。
 * 保存が終わっていないあいだに画面を閉じようとしたら、ブラウザの確認を出す。
 */
export default function SaveStatusBanner() {
  const status = useSyncExternalStore(
    subscribeSaveStatus,
    getSaveStatus,
    getSaveStatusServer
  );
  const unsaved = status.pending > 0 || !!status.failed;

  useEffect(() => {
    if (!unsaved) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [unsaved]);

  if (!status.failed) return null;
  return (
    <div className={styles.banner} role="alert">
      <span className={styles.text}>
        保存できていない変更があります（{status.failed}）。通信状況を確認してください。このまま画面を閉じると、変更が失われることがあります。
      </span>
      <button type="button" className={styles.retry} onClick={retrySavesNow}>
        今すぐ再試行
      </button>
    </div>
  );
}
