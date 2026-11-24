-- JasperDoku room visits - NOT RUN YET. Run it once, when room visits are switched on:
-- Supabase: SQL Editor -> New query -> paste -> Run. Needs setup.sql to have been run first.
--
-- Each player's room is saved as a short list of item names (what's placed, what
-- Jasper wears). No pictures are uploaded. Same lock as the leaderboard: the
-- table can't be reached directly, and both functions need your family code.
--
-- Names are locked to a device: the first phone or tablet to share a room as "KJ"
-- keeps that name, so another device using the same name can't save over it
-- (it's told to pick another name instead). The lock lifts on its own if that
-- room goes 60 days without being shared, or delete the row in Table Editor ->
-- room_layouts to free a name straight away. Renaming moves your house to the
-- new name, so old names don't linger on the street.

create table if not exists public.room_layouts (
  room       text not null references public.rooms(code) on delete cascade,
  player     text not null check (char_length(player) between 1 and 24),
  layout     jsonb not null check (pg_column_size(layout) < 4000),
  device     text not null check (char_length(device) between 16 and 64),
  updated_at timestamptz not null default now(),
  primary key (room, player)
);

alter table public.room_layouts enable row level security;
revoke all on public.room_layouts from anon, authenticated;

-- Save (or replace) your own room layout (only with a valid family code).
-- Returns 'ok', or 'taken' when another device already owns that name.
create or replace function public.save_room(p_room text, p_player text, p_layout jsonb, p_device text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_player text := trim(p_player);
  v_owner  text;
  v_seen   timestamptz;
begin
  if not exists (select 1 from rooms where code = p_room) then
    raise exception 'unknown family code';
  end if;
  select device, updated_at into v_owner, v_seen
  from room_layouts where room = p_room and player = v_player;
  if found and v_owner <> p_device and v_seen > now() - interval '60 days' then
    return 'taken';
  end if;
  -- one name per device: after a rename, the old house goes away
  delete from room_layouts where room = p_room and device = p_device and player <> v_player;
  insert into room_layouts (room, player, layout, device, updated_at)
  values (p_room, v_player, p_layout, p_device, now())
  on conflict (room, player) do update
    set layout = excluded.layout, device = excluded.device, updated_at = now();
  return 'ok';
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

revoke all on function public.save_room(text, text, jsonb, text) from public;
revoke all on function public.get_rooms(text) from public;
grant execute on function public.save_room(text, text, jsonb, text) to anon;
grant execute on function public.get_rooms(text) to anon;
