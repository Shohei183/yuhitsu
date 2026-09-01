import Link from "next/link";

export default function NotFound() {
  return (
    <main style={{ maxWidth: 420, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 14 }}>ページが見つかりません</h1>
      <p style={{ fontSize: 14, color: "#666" }}>
        指定された議案は存在しません。
      </p>
      <Link href="/" style={{ fontSize: 14 }}>
        ← 議案一覧へ
      </Link>
    </main>
  );
}
