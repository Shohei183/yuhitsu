"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { login, sendPasswordReset } from "@/lib/authStore";
import { useAuthState } from "@/lib/useOrg";
import { LOM_NAME } from "@/lib/lom";
import styles from "./LoginForm.module.css";

type Mode = "login" | "reset-request";

export default function LoginForm() {
  const router = useRouter();
  const { userId, ready } = useAuthState();

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (ready && userId) router.replace("/");
  }, [ready, userId, router]);

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await login(email, password);
    setBusy(false);
    if (res.ok) router.replace("/");
    else setError(res.error ?? "ログインできませんでした");
  };

  const onResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await sendPasswordReset(email);
    setBusy(false);
    if (res.ok) {
      setInfo(
        `${email} 宛にパスワード再設定メールを送信しました。メール内のリンクから新しいパスワードを設定してください。`
      );
      setMode("login");
    } else {
      setError(res.error ?? "送信できませんでした");
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.brand}>{LOM_NAME}</div>
        <h1 className={styles.title}>JC議案管理システム</h1>

        {error && <div className={styles.error}>{error}</div>}
        {info && <div className={styles.info}>{info}</div>}

        {mode === "login" && (
          <form className={styles.form} onSubmit={onLogin}>
            <label className={styles.label}>メールアドレス</label>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
            <label className={styles.label}>パスワード</label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button type="submit" className={styles.primary} disabled={busy}>
              {busy ? "確認中…" : "ログイン"}
            </button>
            <button
              type="button"
              className={styles.linkBtn}
              onClick={() => {
                setError(null);
                setInfo(null);
                setMode("reset-request");
              }}
            >
              パスワードをお忘れですか？
            </button>
          </form>
        )}

        {mode === "reset-request" && (
          <form className={styles.form} onSubmit={onResetRequest}>
            <p className={styles.note}>
              登録メールアドレスに再設定用のリンクを送ります。
            </p>
            <label className={styles.label}>メールアドレス</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
            <button type="submit" className={styles.primary} disabled={busy}>
              {busy ? "送信中…" : "再設定メールを送信"}
            </button>
            <button
              type="button"
              className={styles.linkBtn}
              onClick={() => {
                setError(null);
                setMode("login");
              }}
            >
              ← ログインに戻る
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
