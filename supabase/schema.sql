-- ============================================================
-- yuhitsu 本番スキーマ（Supabase Postgres）
--   単一LOM / まっさらスタート / 「最後の保存が勝ち」
--   複雑な入れ子ドキュメントは jsonb、関係データは正規カラム。
--   Supabase SQL Editor に貼り付けて実行する。冪等（再実行可）。
-- ============================================================

-- ---------- 拡張 ----------
create extension if not exists "pgcrypto";

-- ============================================================
-- 1. members  （auth.users と 1:1。氏名・マスター属性・在籍状態）
-- ============================================================
create table if not exists public.members (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null unique,
  full_name   text not null default '',
  is_master   boolean not null default false,
  status      text not null default 'active' check (status in ('active','retired')),
  created_at  timestamptz not null default now()
);

-- auth.users が増えたら members 行を自動作成
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.members (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 2. 組織構造（年度・委員会・ロール割当）
-- ============================================================
create table if not exists public.fiscal_years (
  id                    text primary key,           -- 'fy-2026'
  label                 text not null,              -- '2026年度'
  planned_period_label  text not null default '',
  live_period_label     text not null default '',
  sort_order            int  not null default 0,
  created_at            timestamptz not null default now()
);

create table if not exists public.committees (
  id              text primary key,                 -- 'cm-2026-soumu'
  fiscal_year_id  text not null references public.fiscal_years(id) on delete cascade,
  name            text not null,
  sort_order      int  not null default 0
);
create index if not exists committees_year_idx on public.committees(fiscal_year_id);

-- 人 × 年度 のロール（同一人物でも年度で役職が異なる）
create table if not exists public.role_assignments (
  id              uuid primary key default gen_random_uuid(),
  fiscal_year_id  text not null references public.fiscal_years(id) on delete cascade,
  member_id       uuid not null references public.members(id) on delete cascade,
  role            text not null,
  committee_id    text references public.committees(id) on delete set null,
  unique (fiscal_year_id, member_id)
);
create index if not exists role_assignments_year_idx on public.role_assignments(fiscal_year_id);

-- ロール権限の「既定からの上書き」だけ保存（既定は permissions.ts の DEFAULT_PERMS）
create table if not exists public.role_perm_overrides (
  role        text not null,
  capability  text not null,
  allowed     boolean not null,
  primary key (role, capability)
);

-- 年度ごとの議案・次第テンプレート（YearTemplate 丸ごと）。行が無ければコード既定を使う。
create table if not exists public.year_templates (
  fiscal_year_id  text primary key references public.fiscal_years(id) on delete cascade,
  data            jsonb not null,
  updated_at      timestamptz not null default now()
);

-- ============================================================
-- 3. 議案
-- ============================================================
create table if not exists public.gians (
  id              text primary key,
  fiscal_year_id  text not null references public.fiscal_years(id) on delete cascade,
  committee_id    text references public.committees(id) on delete set null,
  kind            text not null,        -- 協議 / 審議 / 決算協議 / 決算審議 / 基本方針
  status          text not null,        -- editing / submitted / locked
  doc             jsonb not null,       -- Gian 全体
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists gians_year_idx on public.gians(fiscal_year_id);
create index if not exists gians_committee_idx on public.gians(committee_id);

create table if not exists public.gian_snapshots (
  id         text primary key,
  gian_id    text not null references public.gians(id) on delete cascade,
  kind       text not null,             -- submission / autosave
  reason     text not null default '',
  taken_at   timestamptz not null default now(),
  doc        jsonb not null             -- その時点の Gian
);
create index if not exists gian_snapshots_gian_idx on public.gian_snapshots(gian_id, taken_at);

create table if not exists public.replacement_requests (
  id           text primary key,
  gian_id      text not null references public.gians(id) on delete cascade,
  requested_at timestamptz not null default now(),
  note         text not null default '',
  status       text not null default 'pending',   -- pending / approved / rejected
  decided_at   timestamptz
);
create index if not exists replacement_requests_gian_idx on public.replacement_requests(gian_id);

-- ============================================================
-- 4. 次第
-- ============================================================
create table if not exists public.sidais (
  id               text primary key,
  fiscal_year_id   text not null references public.fiscal_years(id) on delete cascade,
  period           text not null check (period in ('planned','live')),
  doc              jsonb not null,      -- Sidai 全体（meetingName/rows など）
  distribution_id  text,                -- 直近の配信確定で作られた package id
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists sidais_year_period_idx on public.sidais(fiscal_year_id, period);

-- ============================================================
-- 5. 配信データ（確定時点の凍結パッケージ）
-- ============================================================
create table if not exists public.distributions (
  id               text primary key,
  fiscal_year_id   text not null references public.fiscal_years(id) on delete cascade,
  period           text not null check (period in ('planned','live')),
  name             text not null,
  version          int  not null default 1,
  board            text not null,       -- 理事会 / 三役会
  occurrence       text not null default '',
  source_sidai_id  text,
  finalized_at     timestamptz not null default now(),
  doc              jsonb not null       -- DistributionPackage 全体（次第・収録議案の凍結コピー等）
);
create index if not exists distributions_year_period_idx on public.distributions(fiscal_year_id, period);

-- ============================================================
-- 6. ファイル（実体は R2。ここはメタデータのみ）
--    scope で 4 種を区別:
--      shared → owner_id = committee_id
--      gian   → owner_id = gian_id,       category = review / reference
--      fixed  → owner_id = fiscal_year_id
--      dist   → owner_id = distribution_id, gian_id, category
-- ============================================================
create table if not exists public.file_objects (
  id          text primary key,
  scope       text not null check (scope in ('shared','gian','fixed','dist')),
  owner_id    text not null,
  gian_id     text,
  category    text,                      -- review / reference（gian・dist のみ）
  name        text not null,
  size        bigint not null default 0,
  mime        text not null default 'application/octet-stream',
  r2_key      text not null,             -- R2 上のオブジェクトキー
  created_at  timestamptz not null default now()
);
create index if not exists file_objects_scope_owner_idx on public.file_objects(scope, owner_id);

-- ============================================================
-- 7. RLS（ローンチ時は緩め：ログイン済みなら読める／書ける。
--        members の書き込みだけ service_role 経由に限定。
--        ロール別の細かい制限はローンチ後に helper 関数で追加する。）
-- ============================================================
alter table public.members             enable row level security;
alter table public.fiscal_years        enable row level security;
alter table public.committees          enable row level security;
alter table public.role_assignments    enable row level security;
alter table public.role_perm_overrides enable row level security;
alter table public.year_templates      enable row level security;
alter table public.gians               enable row level security;
alter table public.gian_snapshots      enable row level security;
alter table public.replacement_requests enable row level security;
alter table public.sidais              enable row level security;
alter table public.distributions       enable row level security;
alter table public.file_objects        enable row level security;

-- 認証済みユーザーは全行を SELECT 可
do $$
declare t text;
begin
  foreach t in array array[
    'members','fiscal_years','committees','role_assignments','role_perm_overrides',
    'year_templates','gians','gian_snapshots','replacement_requests','sidais',
    'distributions','file_objects'
  ]
  loop
    execute format('drop policy if exists %I on public.%I;', t||'_sel', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (true);',
      t||'_sel', t
    );
  end loop;
end $$;

-- members 以外は 認証済みユーザーが INSERT / UPDATE / DELETE 可（UI 側で master 等を制御）
do $$
declare t text;
begin
  foreach t in array array[
    'fiscal_years','committees','role_assignments','role_perm_overrides',
    'year_templates','gians','gian_snapshots','replacement_requests','sidais',
    'distributions','file_objects'
  ]
  loop
    execute format('drop policy if exists %I on public.%I;', t||'_write', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true);',
      t||'_write', t
    );
  end loop;
end $$;

-- members: 本人は自分の行を UPDATE 可（氏名変更用）。ただし is_master / status は
-- 変えさせない（トリガでガード）。作成・無効化・master 付与は service_role 経由。
drop policy if exists members_self_update on public.members;
create policy members_self_update on public.members
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create or replace function public.guard_member_privileged_columns()
returns trigger language plpgsql as $$
begin
  if auth.role() <> 'service_role' then
    if new.is_master is distinct from old.is_master
       or new.status is distinct from old.status
       or new.email  is distinct from old.email then
      raise exception 'is_master / status / email は変更できません';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists members_guard on public.members;
create trigger members_guard
  before update on public.members
  for each row execute function public.guard_member_privileged_columns();

-- ============================================================
-- 8. 既定データ
-- ============================================================
insert into public.fiscal_years (id, label, planned_period_label, live_period_label, sort_order)
values
  ('fy-2026', '2026年度', '予定者期間（2025年8月〜12月）', '本年度（2026年1月〜12月）', 2026)
on conflict (id) do nothing;

-- role_perm_overrides は空スタート（既定は permissions.ts）
-- committees / members は運用開始後、マスターが画面から作成する
