-- ============================================================
-- 上程届（じょうていとどけ）テーブル
--   委員会 × 会議 ごとに1レコード。協議／審議／報告事項の一覧を doc に。
--   提出（status='submitted'）でロック。編集は議案と同じ権限（editGian）。
-- ============================================================

create table if not exists public.jotei_todokes (
  id              text primary key,
  fiscal_year_id  text not null references public.fiscal_years(id) on delete cascade,
  committee_id    text references public.committees(id) on delete set null,
  status          text not null default 'draft' check (status in ('draft','submitted')),
  meeting_name    text not null default '',
  doc             jsonb not null,
  submitted_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists jotei_todokes_year_idx on public.jotei_todokes(fiscal_year_id);
create index if not exists jotei_todokes_committee_idx on public.jotei_todokes(committee_id);

alter table public.jotei_todokes enable row level security;

drop policy if exists jotei_todokes_sel on public.jotei_todokes;
create policy jotei_todokes_sel on public.jotei_todokes
  for select to authenticated using (true);

-- 上程届の編集・提出・削除は議案の編集と同じ権限（editGian）
--   提出ボタン自体は submitGian を持つ人だけ（UI 側でゲート）。
drop policy if exists jotei_todokes_write on public.jotei_todokes;
create policy jotei_todokes_write on public.jotei_todokes for all to authenticated
  using (public.auth_has_cap('editGian'))
  with check (public.auth_has_cap('editGian'));

notify pgrst, 'reload schema';
