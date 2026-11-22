-- JasperDoku room visits - NOT RUN YET. Run it once, when room visits are switched on:
-- Supabase: SQL Editor -> New query -> paste -> Run. Needs setup.sql to have been run first.
--
-- Each player's room is saved as a short list of item names (what's placed, what
-- Jasper wears). No pictures are uploaded. Same lock as the leaderboard: the
-- table can't be reached directly, and both functions need your family code.

create table if not exists public.room_layouts (
  room       text not null references public.rooms(code) on delete cascade,
  player     text not null check (char_length(player) between 1 and 24),
  layout     jsonb not null check (pg_column_size(layout) < 4000),
  updated_at timestamptz not null default now(),
  primary key (room, player)
);

alter table public.room_layouts enable row level security;
revoke all on public.room_layouts from anon, authenticated;

-- Save (or replace) your own room layout (only with a valid family code).
create or replace function public.save_room(p_room text, p_player text, p_layout jsonb)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from rooms where code = p_room) then
    raise exception 'unknown family code';
  end if;
  insert into room_layouts (room, player, layout, updated_at)
  values (p_room, trim(p_player), p_layout, now())
  on conflict (room, player) do update set layout = excluded.layout, updated_at = now();
end $$;

-- Read every room in the family (only with a valid family code).
create or replace function public.get_rooms(p_room text)
returns table (player text, layout jsonb, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.player, r.layout, r.updated_at
  from room_layouts r
  where r.room = p_room
  order by r.updated_at desc
  limit 100;
$$;

revoke all on function public.save_room(text, text, jsonb) from public;
revoke all on function public.get_rooms(text) from public;
grant execute on function public.save_room(text, text, jsonb) to anon;
grant execute on function public.get_rooms(text) to anon;
