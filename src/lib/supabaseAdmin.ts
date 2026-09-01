import "server-only";

// ─────────────────────────────────────────────────────────────
// Supabase サービスロールクライアント（route handler 専用）
//
// RLS を素通りする強い権限。絶対にクライアントへ出さない。
// アカウント発行・無効化・master 付与など特権操作に使う。
// ─────────────────────────────────────────────────────────────

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function normalizeUrl(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  try {
    return new URL(raw.trim()).origin;
  } catch {
    return raw.trim().replace(/\/(rest|auth|storage|realtime)\/v\d.*$/, "").replace(/\/+$/, "");
  }
}

const url = normalizeUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

let admin: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (admin) return admin;
  if (!url || !serviceKey) {
    throw new Error(
      "Supabase サーバー環境変数が未設定です（NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY）"
    );
  }
  admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}

/**
 * Authorization: Bearer <token> を検証し、認証済みユーザーを返す。
 * route handler の入口で使う。
 */
export async function requireUser(req: Request): Promise<
  | { ok: true; userId: string; email: string }
  | { ok: false; status: number; error: string }
> {
  const authz = req.headers.get("authorization") ?? "";
  const token = authz.toLowerCase().startsWith("bearer ")
    ? authz.slice(7)
    : "";
  if (!token) return { ok: false, status: 401, error: "未認証" };

  const { data, error } = await getSupabaseAdmin().auth.getUser(token);
  if (error || !data.user) {
    return { ok: false, status: 401, error: "セッションが無効です" };
  }
  return { ok: true, userId: data.user.id, email: data.user.email ?? "" };
}

/** 呼び出し元が master かどうか */
export async function isMaster(userId: string): Promise<boolean> {
  const { data } = await getSupabaseAdmin()
    .from("members")
    .select("is_master")
    .eq("id", userId)
    .maybeSingle();
  return Boolean(data?.is_master);
}
