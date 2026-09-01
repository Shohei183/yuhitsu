"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getGian } from "@/lib/mockData";
import { useGianEntry } from "@/lib/useGianStore";
import GianBuilder from "./GianBuilder";

/**
 * 議案の解決を担うクライアントラッパー。
 * - モック議案：`getGian` で取得
 * - 委員会フォルダから新規作成した議案：gianStore（localStorage）に存在
 * どちらにも無ければ「見つかりません」。
 */
export default function GianBuilderPage({ gianId }: { gianId: string }) {
  const entry = useGianEntry(gianId);
  const mock = getGian(gianId);
  const gian = entry?.gian ?? mock;

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!gian) {
    // ストアのハイドレーション前はローディング相当（点滅回避）
    if (!mounted) return null;
    return (
      <main style={{ maxWidth: 560, margin: "0 auto", padding: "40px 20px" }}>
        <p>議案が見つかりません。</p>
        <Link href="/">← トップへ</Link>
      </main>
    );
  }

  return <GianBuilder initialGian={gian} />;
}
