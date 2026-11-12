"use client";

import styles from "./EditNotice.module.css";

/** 編集を開始できなかった／編集権を失った理由を、画面上部に出す（×で閉じる）。 */
export default function EditNotice({
  message,
  onClose,
}: {
  message: string | null;
  onClose: () => void;
}) {
  if (!message) return null;
  return (
    <div className={styles.notice} role="alert">
      <span className={styles.text}>{message}</span>
      <button
        type="button"
        className={styles.close}
        onClick={onClose}
        aria-label="閉じる"
      >
        ×
      </button>
    </div>
  );
}
