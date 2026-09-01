import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabaseAdmin";
import { presignPut, buildKey, r2Configured } from "@/lib/r2";

export const runtime = "nodejs";

type Scope = "shared" | "gian" | "fixed" | "dist";

/**
 * POST /api/files/presign-upload
 * body: { scope, ownerId, name, mime }
 * → { fileId, r2Key, uploadUrl }
 * クライアントは uploadUrl に PUT した後、file_objects 行を supabase-js で INSERT する。
 */
export async function POST(req: Request) {
  if (!r2Configured()) {
    return NextResponse.json({ error: "R2 未設定" }, { status: 503 });
  }
  const auth = await requireUser(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: {
    scope?: Scope;
    ownerId?: string;
    name?: string;
    mime?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエスト" }, { status: 400 });
  }

  const { scope, ownerId, name } = body;
  const mime = body.mime || "application/octet-stream";
  if (
    !scope ||
    !["shared", "gian", "fixed", "dist"].includes(scope) ||
    !ownerId ||
    !name
  ) {
    return NextResponse.json({ error: "パラメータ不足" }, { status: 400 });
  }

  const fileId = `f-${crypto.randomUUID()}`;
  const r2Key = buildKey(scope, ownerId, fileId, name);
  const uploadUrl = await presignPut(r2Key, mime, 600);

  return NextResponse.json({ fileId, r2Key, uploadUrl });
}
