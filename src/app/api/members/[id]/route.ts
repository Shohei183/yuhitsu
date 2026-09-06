import { NextResponse } from "next/server";
import { requireUser, hasCapability, getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * PATCH /api/members/:id   （manageMembers 権限）
 * body: { fullName?, email?, status?: 'active'|'retired', isMaster?: boolean }
 * 氏名・メール・在籍・master 属性の変更。members は RLS トリガで本人経由の
 * 特権カラム変更を禁止しているため、ここで service_role から実施する。
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!(await hasCapability(auth.userId, "manageMembers"))) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }

  const { id } = await params;
  let body: {
    status?: string;
    isMaster?: boolean;
    fullName?: string;
    email?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエスト" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  const { data: current, error: curErr } = await admin
    .from("members")
    .select("full_name, email, status, is_master")
    .eq("id", id)
    .maybeSingle();
  if (curErr || !current) {
    return NextResponse.json({ error: "メンバーが見つかりません" }, { status: 404 });
  }

  const patch: Record<string, unknown> = {};

  if (body.status === "active" || body.status === "retired") {
    if (body.status !== current.status) patch.status = body.status;
  }
  if (typeof body.isMaster === "boolean" && body.isMaster !== current.is_master) {
    patch.is_master = body.isMaster;
  }
  if (typeof body.fullName === "string") {
    const name = body.fullName.trim();
    if (name && name !== (current.full_name ?? "")) patch.full_name = name;
  }

  let newEmail: string | null = null;
  if (typeof body.email === "string") {
    const e = body.email.trim().toLowerCase();
    if (e && e !== (current.email ?? "").toLowerCase()) {
      if (!EMAIL_RE.test(e)) {
        return NextResponse.json(
          { error: "メールアドレスの形式が正しくありません" },
          { status: 400 }
        );
      }
      const { data: dup } = await admin
        .from("members")
        .select("id")
        .eq("email", e)
        .neq("id", id)
        .maybeSingle();
      if (dup) {
        return NextResponse.json(
          { error: "そのメールアドレスは既に使われています" },
          { status: 400 }
        );
      }
      newEmail = e;
      patch.email = e;
    }
  }

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

  // メール変更は先に auth.users 側を更新（ユニーク制約はこちらでも効く）
  if (newEmail) {
    const { error: aErr } = await admin.auth.admin.updateUserById(id, {
      email: newEmail,
      email_confirm: true,
    });
    if (aErr) {
      return NextResponse.json(
        { error: `メールを変更できませんでした：${aErr.message}` },
        { status: 400 }
      );
    }
  }

  const { error } = await admin.from("members").update(patch).eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (patch.status === "retired") {
    await admin.auth.admin.updateUserById(id, { ban_duration: "876000h" });
  } else if (patch.status === "active") {
    await admin.auth.admin.updateUserById(id, { ban_duration: "none" });
  }

  return NextResponse.json({ ok: true });
}
