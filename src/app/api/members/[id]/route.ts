import { NextResponse } from "next/server";
import { requireUser, isMaster, getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * PATCH /api/members/:id   （master のみ）
 * body: { status?: 'active'|'retired', isMaster?: boolean }
 * 特権カラムの変更。RLS トリガで本人経由の変更は禁止しているためここで実施。
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!(await isMaster(auth.userId))) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }

  const { id } = await params;
  let body: { status?: string; isMaster?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエスト" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.status === "active" || body.status === "retired") patch.status = body.status;
  if (typeof body.isMaster === "boolean") patch.is_master = body.isMaster;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "変更内容がありません" }, { status: 400 });
  }

  // 自分自身の master 剥奪は禁止（ロックアウト防止）
  if (id === auth.userId && patch.is_master === false) {
    return NextResponse.json(
      { error: "自分のマスター権限は外せません" },
      { status: 400 }
    );
  }

  const admin = getSupabaseAdmin();
  const { error } = await admin.from("members").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // 退会にしたらセッションを無効化
  if (patch.status === "retired") {
    await admin.auth.admin.updateUserById(id, { ban_duration: "876000h" });
  } else if (patch.status === "active") {
    await admin.auth.admin.updateUserById(id, { ban_duration: "none" });
  }

  return NextResponse.json({ ok: true });
}
