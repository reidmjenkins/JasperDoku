-- JasperDoku gifts for Jasper - NOT RUN YET. Run it once:
-- Supabase: SQL Editor -> New query -> paste -> Run. Needs setup.sql and rooms.sql first.
--
-- While visiting someone's room, a player can leave treats in that Jasper's
-- bowl or give him some catnip. The gift waits here until the room's owner
-- next opens their room, where their Jasper enjoys it and they see who left it.
-- Only the device that owns a name (see rooms.sql) can leave gifts from it or
-- open the gifts left for it.

create table if not exists public.gifts (
  id          bigint generated always as identity primary key,
  room        text not null references public.rooms(code) on delete cascade,
  from_player text not null check (char_length(from_player) between 1 and 24),
  to_player   text not null check (char_length(to_player) between 1 and 24),
  kind        text not null check (kind in ('treats', 'catnip')),
  created_at  timestamptz not null default now(),
  claimed_at  timestamptz
);
create index if not exists gifts_waiting on public.gifts (room, to_player) where claimed_at is null;

alter table public.gifts enable row level security;
revoke all on public.gifts from anon, authenticated;

-- Leave a gift. Returns 'ok', 'not-you' (this device doesn't own the sender's
-- name), 'no-house' (that player has no room yet) or 'too-many'.
create or replace function public.send_gift(p_room text, p_from text, p_device text, p_to text, p_kind text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_from text := trim(p_from);
  v_to   text := trim(p_to);
begin
  if not exists (select 1 from rooms where code = p_room) then
    raise exception 'unknown family code';
  end if;
  if not exists (select 1 from room_layouts where room = p_room and player = v_from and device = p_device) then
    return 'not-you';
  end if;
  if v_to = v_from or not exists (select 1 from room_layouts where room = p_room and player = v_to) then
    return 'no-house';
  end if;
  if (select count(*) from gifts where room = p_room and from_player = v_from and created_at > now() - interval '1 day') >= 20 then
    return 'too-many';
  end if;
  insert into gifts (room, from_player, to_player, kind) values (p_room, v_from, v_to, p_kind);
  return 'ok';
end $$;

-- Open the gifts waiting in your room (each one is handed over only once).
create or replace function public.claim_gifts(p_room text, p_player text, p_device text)
returns table (from_player text, kind text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from room_layouts r where r.room = p_room and r.player = trim(p_player) and r.device = p_device) then
    return;
  end if;
  return query
    update gifts g set claimed_at = now()
    where g.room = p_room and g.to_player = trim(p_player) and g.claimed_at is null
    returning g.from_player, g.kind, g.created_at;
end $$;

-- How many gifts are waiting (for the home screen), without opening them.
create or replace function public.gifts_waiting(p_room text, p_player text, p_device text)
returns int
language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from room_layouts r where r.room = p_room and r.player = trim(p_player) and r.device = p_device)
    then (select count(*)::int from gifts g where g.room = p_room and g.to_player = trim(p_player) and g.claimed_at is null)
    else 0 end;
$$;

revoke all on function public.send_gift(text, text, text, text, text) from public;
revoke all on function public.claim_gifts(text, text, text) from public;
revoke all on function public.gifts_waiting(text, text, text) from public;
grant execute on function public.send_gift(text, text, text, text, text) to anon;
grant execute on function public.claim_gifts(text, text, text) to anon;
grant execute on function public.gifts_waiting(text, text, text) to anon;
