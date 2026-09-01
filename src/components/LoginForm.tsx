"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  login,
  resetPassword,
  sendPasswordReset,
} from "@/lib/authStore";
import { DEMO_PASSWORD } from "@/lib/memberStore";
import { useAuthMember } from "@/lib/useOrg";
import styles from "./LoginForm.module.css";

type Mode = "login" | "reset-request" | "reset-set";

export default function LoginForm() {
  const router = useRouter();
  const member = useAuthMember();

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // すでにログイン済みならトップへ
  useEffect(() => {
    if (member) router.replace("/");
  }, [member, router]);

  const onLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const res = login(email, password);
    if (res.ok) {
      router.replace("/");
    } else {
      setError(res.error ?? "ログインできませんでした");
    }
  };

  const onResetRequest = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const res = sendPasswordReset(email);
    if (res.ok) {
      setInfo(
        `${email} 宛にパスワード再設定メールを送信しました（このプロトタイプではダミー送信です）。`
      );
      setMode("reset-set");
    } else {
      setError(res.error ?? "送信できませんでした");
    }
  };

  const onResetSet = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const res = resetPassword(email, newPassword);
    if (res.ok) {
      setInfo("パスワードを再設定しました。新しいパスワードでログインしてください。");
      setPassword("");
      setNewPassword("");
      setMode("login");
    } else {
      setError(res.error ?? "再設定できませんでした");
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.brand}>一般社団法人小牧青年会議所</div>
        <h1 className={styles.title}>
          JC議案管理システム
          <span className={styles.proto}>プロトタイプ</span>
        </h1>

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
              placeholder="you@komaki-jc.example"
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
            <button type="submit" className={styles.primary}>
              ログイン
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
              登録メールアドレスに再設定用のリンクを送ります（ダミー）。
            </p>
            <label className={styles.label}>メールアドレス</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@komaki-jc.example"
              required
            />
            <button type="submit" className={styles.primary}>
              再設定メールを送信
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

        {mode === "reset-set" && (
          <form className={styles.form} onSubmit={onResetSet}>
            <p className={styles.note}>
              新しいパスワードを設定してください（{email}）。
            </p>
            <label className={styles.label}>新しいパスワード</label>
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
            <button type="submit" className={styles.primary}>
              パスワードを再設定
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

        <div className={styles.demoBox}>
          <div className={styles.demoTitle}>デモ用アカウント</div>
          <ul>
            <li>
              マスター：<code>master@komaki-jc.example</code>
            </li>
            <li>
              理事長（2027年度）：<code>umezawa@komaki-jc.example</code>
            </li>
            <li>
              専務（2027年度）：<code>mizuochi@komaki-jc.example</code>
            </li>
            <li>
              委員長（2027年度）／委員会メンバー（2026年度）：
              <code>tsutsui@komaki-jc.example</code>
            </li>
          </ul>
          <div className={styles.demoPw}>
            パスワードは全員 <code>{DEMO_PASSWORD}</code>
          </div>
        </div>
      </div>
    </div>
  );
}
