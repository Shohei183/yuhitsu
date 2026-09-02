import { NextResponse } from "next/server";

export const runtime = "nodejs";

// 一時的な診断用。値は返さず「存在するか」だけ。確認後すぐ削除する。
export async function GET() {
  const keys = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_SITE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET",
  ];
  const has: Record<string, boolean> = {};
  const len: Record<string, number> = {};
  for (const k of keys) {
    const v = process.env[k];
    has[k] = typeof v === "string" && v.length > 0;
    len[k] = typeof v === "string" ? v.length : 0;
  }
  return NextResponse.json({ has, len, allEnvKeyCount: Object.keys(process.env).length });
}
