import type { Metadata, Viewport } from "next";
import "./globals.css";
import AppFrame from "@/components/AppFrame";

export const metadata: Metadata = {
  title: "yuhitsu — JC議案管理システム（プロトタイプ）",
  description:
    "JC向け アジェンダ・議案管理システムのUI確認用プロトタイプ。モックデータで動作します。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>
        <AppFrame>{children}</AppFrame>
      </body>
    </html>
  );
}
