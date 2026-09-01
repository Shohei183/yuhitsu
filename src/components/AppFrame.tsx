"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthState } from "@/lib/useOrg";
import TopBar from "./TopBar";
import DataProvider from "./DataProvider";
import styles from "./AppFrame.module.css";

/** ログイン不要で表示するパス */
function isPublicPath(pathname: string): boolean {
  return pathname === "/login" || pathname.startsWith("/login/");
}

export default function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { userId, ready } = useAuthState();

  const publicPath = isPublicPath(pathname);

  useEffect(() => {
    if (ready && !publicPath && !userId) {
      router.replace("/login");
    }
  }, [ready, publicPath, userId, router]);

  // ログイン画面など：フレームなしで素通し
  if (publicPath) return <>{children}</>;

  // セッション判定中
  if (!ready) {
    return <div className={styles.boot} aria-hidden />;
  }

  if (!userId) {
    return (
      <div className={styles.gate}>
        <p>ログインが必要です。</p>
        <Link href="/login">ログイン画面へ →</Link>
      </div>
    );
  }

  return (
    <DataProvider>
      <div className={styles.frame}>
        <TopBar />
        <div className={styles.body}>{children}</div>
      </div>
    </DataProvider>
  );
}
