-- =========================================================
-- Devocional — esquema do banco (Supabase / Postgres)
-- Rode tudo de uma vez em: Supabase → SQL Editor → New query → Run
-- =========================================================

-- ---------- Atividades (Devocional, Leitura, ...) ----------
create table if not exists public.activity_types (
  id          uuid primary key,
  user_id     uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name        text not null check (char_length(name) between 1 and 40),
  goal_min    integer not null check (goal_min between 1 and 600),
  color       text not null default '#6d4fd8',
  archived    boolean not null default false,
  updated_at  timestamptz not null default now()
);
create index if not exists activity_types_user_updated on public.activity_types (user_id, updated_at);

-- ---------- Sessões cronometradas ----------
create table if not exists public.sessions (
  id            uuid primary key,
  user_id       uuid not null references auth.users (id) on delete cascade default auth.uid(),
  type_id       uuid not null references public.activity_types (id) on delete cascade,
  started_at    timestamptz not null,
  ended_at      timestamptz not null,
  duration_sec  integer not null check (duration_sec between 0 and 86400),
  goal_min      integer,
  passage       text check (passage is null or char_length(passage) <= 120),
  note          text check (note is null or char_length(note) <= 4000),
  deleted       boolean not null default false,
  updated_at    timestamptz not null default now()
);
create index if not exists sessions_user_updated on public.sessions (user_id, updated_at);

-- ---------- RLS: cada usuário só vê e altera o que é dele ----------
alter table public.activity_types enable row level security;
alter table public.sessions       enable row level security;

drop policy if exists "types_select_own" on public.activity_types;
drop policy if exists "types_insert_own" on public.activity_types;
drop policy if exists "types_update_own" on public.activity_types;
drop policy if exists "types_delete_own" on public.activity_types;
create policy "types_select_own" on public.activity_types for select to authenticated using (user_id = auth.uid());
create policy "types_insert_own" on public.activity_types for insert to authenticated with check (user_id = auth.uid());
create policy "types_update_own" on public.activity_types for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "types_delete_own" on public.activity_types for delete to authenticated using (user_id = auth.uid());

drop policy if exists "sessions_select_own" on public.sessions;
drop policy if exists "sessions_insert_own" on public.sessions;
drop policy if exists "sessions_update_own" on public.sessions;
drop policy if exists "sessions_delete_own" on public.sessions;
create policy "sessions_select_own" on public.sessions for select to authenticated using (user_id = auth.uid());
create policy "sessions_insert_own" on public.sessions for insert to authenticated with check (user_id = auth.uid());
create policy "sessions_update_own" on public.sessions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "sessions_delete_own" on public.sessions for delete to authenticated using (user_id = auth.uid());

-- ---------- TOTP (somente as Edge Functions acessam) ----------
create table if not exists public.totp_secrets (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  email           text not null,
  secret          text,             -- segredo ativo (base32)
  pending_secret  text,             -- segredo aguardando confirmação
  confirmed       boolean not null default false,
  last_used_step  bigint not null default 0,  -- impede reutilizar o mesmo código
  updated_at      timestamptz not null default now()
);
create unique index if not exists totp_secrets_email on public.totp_secrets (lower(email));

create table if not exists public.login_attempts (
  id       bigserial primary key,
  email    text not null,
  success  boolean not null,
  at       timestamptz not null default now()
);
create index if not exists login_attempts_email_at on public.login_attempts (lower(email), at);

-- RLS ligado e nenhuma política = nenhum acesso pelo app (anon/authenticated).
alter table public.totp_secrets   enable row level security;
alter table public.login_attempts enable row level security;
revoke all on public.totp_secrets   from anon, authenticated;
revoke all on public.login_attempts from anon, authenticated;
