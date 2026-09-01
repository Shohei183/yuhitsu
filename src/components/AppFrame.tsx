"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthMember } from "@/lib/useOrg";
import TopBar from "./TopBar";
import styles from "./AppFrame.module.css";

/** ログイン不要で表示するパス */
function isPublicPath(pathname: string): boolean {
  return pathname === "/login" || pathname.startsWith("/login/");
}

export default function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const member = useAuthMember();

  // SSR / ハイドレーション時は localStorage を読めないため、
  // マウント後に認証状態で描画を切り替える（既存ストアの getXDefault 方針と同じ）。
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const publicPath = isPublicPath(pathname);

  useEffect(() => {
    if (mounted && !publicPath && !member) {
      router.replace("/login");
    }
  }, [mounted, publicPath, member, router]);

  // ログイン画面など：フレームなしで素通し
  if (publicPath) return <>{children}</>;

  if (!mounted) {
    return <div className={styles.boot} aria-hidden />;
  }

  if (!member) {
    return (
      <div className={styles.gate}>
        <p>ログインが必要です。</p>
        <Link href="/login">ログイン画面へ →</Link>
      </div>
    );
  }

  return (
    <div className={styles.frame}>
      <TopBar />
      <div className={styles.body}>{children}</div>
    </div>
  );
}
