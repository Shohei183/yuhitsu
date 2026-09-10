-- ============================================================
-- 委員会報告（委員会ごとに1レコード。会議のたびに meetings へ追記）
--   委員会フォルダ直下。開催日／出席者／内容 を積み上げていく。
-- ============================================================

create table if not exists public.committee_reports (
  id              text primary key,
  fiscal_year_id  text not null references public.fiscal_years(id) on delete cascade,
  committee_id    text not null references public.committees(id) on delete cascade,
  committee_name  text not null default '',
  doc             jsonb not null,          -- CommitteeReport 全体（meetings 配列）
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (committee_id)
);
create index if not exists committee_reports_year_idx
  on public.committee_reports(fiscal_year_id);

alter table public.committee_reports enable row level security;

drop policy if exists committee_reports_sel on public.committee_reports;
create policy committee_reports_sel on public.committee_reports
  for select to authenticated using (true);

-- 編集は議案の編集と同じ権限（editGian＝委員会メンバー以上）
drop policy if exists committee_reports_write on public.committee_reports;
create policy committee_reports_write on public.committee_reports for all to authenticated
  using (public.auth_has_cap('editGian'))
  with check (public.auth_has_cap('editGian'));

notify pgrst, 'reload schema';
