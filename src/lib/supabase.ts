"use client";

// ─────────────────────────────────────────────────────────────
// Supabase ブラウザクライアント（シングルトン）
//
// このアプリはほぼ全画面が "use client" で、セッションは localStorage に
// 保存する（従来の各ストアと同じ流儀）。SSR 用の @supabase/ssr は使わない。
// ─────────────────────────────────────────────────────────────

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
// 新形式（sb_publishable_…）は PUBLISHABLE_KEY、旧形式（JWT）は ANON_KEY。両対応。
const anon =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** 環境変数が未設定でもビルドは通す。実行時に呼ぶと明示エラー。 */
let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  if (!url || !anon) {
    throw new Error(
      "Supabase の環境変数が未設定です（NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY）"
    );
  }
  client = createClient(url, anon, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: "yuhitsu.sb-auth",
    },
  });
  return client;
}

/** 環境変数が入っているか（未設定なら本番接続前のプレビュー扱い） */
export function isSupabaseConfigured(): boolean {
  return Boolean(url && anon);
}

/** 現在のアクセストークン（route handler 呼び出し時の Authorization 用） */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await getSupabase().auth.getSession();
  return data.session?.access_token ?? null;
}
