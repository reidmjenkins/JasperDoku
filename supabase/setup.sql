-- JasperDoku leaderboard - run once in Supabase: SQL Editor -> New query -> paste -> Run.
--
-- Privacy design: the tables are locked (no direct access with the public key).
-- The app can only call two functions, and both require your private family
-- code. Anyone without the code can't read or add scores.
--
-- BEFORE RUNNING: replace YOUR-FAMILY-CODE on the last line with your code.

create table if not exists public.rooms (
  code text primary key
);

create table if not exists public.scores (
  id         bigint generated always as identity primary key,
  room       text not null references public.rooms(code) on delete cascade,
  player     text not null check (char_length(player) between 1 and 24),
  puzzle     text not null check (char_length(puzzle) between 1 and 40),
  time_sec   int  not null check (time_sec between 1 and 86400),
  mistakes   int  not null default 0 check (mistakes between 0 and 999),
  hints      int  not null default 0 check (hints between 0 and 999),
  created_at timestamptz not null default now()
);
create index if not exists scores_room_time on public.scores (room, created_at);

-- Lock the tables: row level security on, and no policies = no direct access.
alter table public.rooms  enable row level security;
alter table public.scores enable row level security;
revoke all on public.rooms, public.scores from anon, authenticated;

-- Add a finished puzzle time (only with a valid family code).
create or replace function public.submit_score(
  p_room text, p_player text, p_puzzle text, p_time int, p_mistakes int, p_hints int
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from rooms where code = p_room) then
    raise exception 'unknown family code';
  end if;
  insert into scores (room, player, puzzle, time_sec, mistakes, hints)
  values (p_room, trim(p_player), p_puzzle, p_time, p_mistakes, p_hints);
end $$;

-- Read the family's times (only with a valid family code).
create or replace function public.get_scores(p_room text, p_since timestamptz default 'epoch')
returns table (player text, puzzle text, time_sec int, mistakes int, hints int, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.player, s.puzzle, s.time_sec, s.mistakes, s.hints, s.created_at
  from scores s
  where s.room = p_room and s.created_at > p_since
  order by s.created_at
  limit 5000;
$$;

-- Check a family code is valid (used by the app's "Join" button).
create or replace function public.check_room(p_room text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from rooms where code = p_room);
$$;

revoke all on function public.submit_score(text, text, text, int, int, int) from public;
revoke all on function public.get_scores(text, timestamptz) from public;
revoke all on function public.check_room(text) from public;
grant execute on function public.submit_score(text, text, text, int, int, int) to anon;
grant execute on function public.get_scores(text, timestamptz) to anon;
grant execute on function public.check_room(text) to anon;

-- Your private family code (keep it secret - don't put it in GitHub):
insert into public.rooms (code) values ('YOUR-FAMILY-CODE') on conflict do nothing;
