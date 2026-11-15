-- ============================================================
-- 予算書の保存履歴（budget_snapshots）
--   - 編集開始時・保存して終了・10分ごとの自動保存・履歴からの復元の直前に、
--     予算書の内容（doc）を丸ごと1行として残す（アプリ側が insert）。
--   - 1つの予算書につき、新しい100件だけ保持（超えた古いものは自動で消える）。
--   - 予算書を削除すると履歴も消える（on delete cascade）。
--   - 誰が保存したか（member_name）は、DB が auth.uid() から自動で入れる。
--   Supabase SQL Editor / scripts/db.mjs で実行。冪等。
-- ============================================================

create table if not exists public.budget_snapshots (
  id           uuid primary key default gen_random_uuid(),
  budget_id    text not null references public.budget_docs(id) on delete cascade,
  taken_at     timestamptz not null default now(),
  reason       text not null default '',
  member_name  text not null default '',
  doc          jsonb not null
);

create index if not exists budget_snapshots_budget_idx
  on public.budget_snapshots(budget_id, taken_at desc);

alter table public.budget_snapshots enable row level security;

drop policy if exists budget_snapshots_sel on public.budget_snapshots;
create policy budget_snapshots_sel on public.budget_snapshots
  for select to authenticated using (true);

-- 追加できるのは、予算書を編集できる人だけ（更新・削除はできない）
drop policy if exists budget_snapshots_ins on public.budget_snapshots;
create policy budget_snapshots_ins on public.budget_snapshots
  for insert to authenticated with check (public.auth_has_cap('editGian'));

-- 追加時：保存した人の名前を入れ、古い履歴を整理する
create or replace function public.budget_snapshots_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.member_name, '') = '' and auth.uid() is not null then
    select coalesce(nullif(full_name, ''), split_part(email, '@', 1))
      into new.member_name from public.members where id = auth.uid();
    new.member_name := coalesce(new.member_name, '');
  end if;
  return new;
end;
$$;

create or replace function public.budget_snapshots_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.budget_snapshots
   where budget_id = new.budget_id
     and id in (
       select id from public.budget_snapshots
        where budget_id = new.budget_id
        order by taken_at desc
        offset 100
     );
  return null;
end;
$$;

drop trigger if exists budget_snapshots_bi on public.budget_snapshots;
create trigger budget_snapshots_bi
  before insert on public.budget_snapshots
  for each row execute function public.budget_snapshots_before_insert();

drop trigger if exists budget_snapshots_ai on public.budget_snapshots;
create trigger budget_snapshots_ai
  after insert on public.budget_snapshots
  for each row execute function public.budget_snapshots_after_insert();

notify pgrst, 'reload schema';
