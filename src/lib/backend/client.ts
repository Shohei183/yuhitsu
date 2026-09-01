"use client";

// ─────────────────────────────────────────────────────────────
// バックエンド共通ヘルパー
//  - db()        : Supabase ブラウザクライアント
//  - authedFetch : 自前 API route を Bearer トークン付きで叩く
// ─────────────────────────────────────────────────────────────

import { getSupabase, getAccessToken } from "@/lib/supabase";

export function db() {
  return getSupabase();
}

export async function authedFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  return fetch(path, { ...init, headers });
}

/** authedFetch の結果を {ok,error,data} に整形 */
export async function callApi<T = unknown>(
  path: string,
  body?: unknown,
  method = "POST"
): Promise<{ ok: boolean; error?: string; data?: T }> {
  try {
    const res = await authedFetch(path, {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return { ok: false, error: (json.error as string) || `エラー (${res.status})` };
    }
    return { ok: true, data: json as T };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "通信エラー" };
  }
}
