import { NextResponse } from "next/server";
import { requireUser, getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { presignGet, deleteObject, r2Configured } from "@/lib/r2";

export const runtime = "nodejs";

/**
 * GET /api/files/:id?download=1
 * → { url } 署名付き GET URL（既定は inline 表示、download=1 で添付保存）
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!r2Configured()) {
    return NextResponse.json({ error: "R2 未設定" }, { status: 503 });
  }
  const auth = await requireUser(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const { data, error } = await getSupabaseAdmin()
    .from("file_objects")
    .select("r2_key, name")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: "ファイルが見つかりません" }, { status: 404 });
  }

  const wantsDownload = new URL(req.url).searchParams.get("download") === "1";
  const url = await presignGet(
    data.r2_key,
    600,
    wantsDownload ? data.name : undefined
  );
  return NextResponse.json({ url });
}

/**
 * DELETE /api/files/:id
 * R2 のオブジェクトと file_objects 行の両方を削除
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("file_objects")
    .select("r2_key")
    .eq("id", id)
    .maybeSingle();

  if (data?.r2_key && r2Configured()) {
    try {
      await deleteObject(data.r2_key);
    } catch {
      /* R2 側が既に無い場合は無視 */
    }
  }
  await admin.from("file_objects").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
