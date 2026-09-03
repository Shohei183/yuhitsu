"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { updatePassword } from "@/lib/authStore";
import { useAuthState } from "@/lib/useOrg";
import { LOM_NAME } from "@/lib/lom";
import styles from "./LoginForm.module.css";

/**
 * 招待メール／パスワード再設定メールのリンクから遷移してくる画面。
 * Supabase が URL のトークンからセッションを張るので、そのまま
 * updateUser({ password }) で新パスワードを設定できる。
 */
export default function SetPasswordForm() {
  const router = useRouter();
  const { userId, ready } = useAuthState();

  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // セッションが張られていない（リンク切れ等）→ ログインへ
  useEffect(() => {
    if (ready && !userId && !done) {
      const t = setTimeout(() => router.replace("/login"), 4000);
      return () => clearTimeout(t);
    }
  }, [ready, userId, done, router]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (pw1 !== pw2) {
      setError("パスワードが一致しません");
      return;
    }
    setBusy(true);
    const res = await updatePassword(pw1);
    setBusy(false);
    if (res.ok) {
      setDone(true);
      setTimeout(() => router.replace("/"), 1200);
    } else {
      setError(res.error ?? "設定できませんでした");
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.brand}>{LOM_NAME}</div>
        <h1 className={styles.title}>パスワードの設定</h1>

        {error && <div className={styles.error}>{error}</div>}
        {done && <div className={styles.info}>設定しました。移動します…</div>}
        {ready && !userId && !done && (
          <div className={styles.error}>
            リンクの有効期限が切れているか、無効です。ログイン画面から再度お試しください。
          </div>
        )}

        {!done && (
          <form className={styles.form} onSubmit={onSubmit}>
            <label className={styles.label}>新しいパスワード（8文字以上）</label>
            <input
              type="password"
              autoComplete="new-password"
              value={pw1}
              onChange={(e) => setPw1(e.target.value)}
              required
            />
            <label className={styles.label}>もう一度入力</label>
            <input
              type="password"
              autoComplete="new-password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              required
            />
            <button type="submit" className={styles.primary} disabled={busy}>
              {busy ? "設定中…" : "パスワードを設定"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
