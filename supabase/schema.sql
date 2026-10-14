-- Movie Night Roulette: accounts + shared rooms schema.
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Safe to re-run: every statement is idempotent.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  invite_code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.room_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  joined_at timestamptz not null default now(),
  unique (room_id, user_id)
);

create table if not exists public.movies (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  source text not null check (source in ('tvdb', 'manual', 'demo')),
  tvdb_id integer,
  title text not null,
  year text not null default 'TBA',
  runtime integer not null default 100,
  genres text[] not null default '{}',
  moods text[] not null default '{}',
  synopsis text not null default '',
  poster_url text not null default '',
  trailer_url text,
  added_by uuid not null references auth.users (id),
  added_at timestamptz not null default now(),
  status text not null default 'unwatched' check (status in ('unwatched', 'watched')),
  watched_at timestamptz
);

-- Added with the language filter: the movie's original language, as a
-- three-letter code ("eng"). Null for manual picks and older rows; the app
-- fills in older TVDB movies the next time they load.
alter table public.movies add column if not exists language text;

-- The film's English title when it differs from its own (original-language)
-- title, e.g. title "Južina", english_title "Sirocco". Shown small under the
-- title. Filled when a movie is added and for older movies on their next load.
alter table public.movies add column if not exists english_title text;

create index if not exists movies_room_id_idx on public.movies (room_id);

create table if not exists public.ratings (
  movie_id uuid not null references public.movies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  score integer not null check (score between 1 and 10),
  note text not null default '',
  rated_at timestamptz not null default now(),
  primary key (movie_id, user_id)
);

-- One-time upgrade: ratings used to be 1-5 and are now 1-10. If the database
-- still has the old 1-5 rule, widen it and double the existing scores so they
-- mean the same thing. Does nothing on a fresh or already-upgraded database.
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'ratings_score_check'
      and conrelid = 'public.ratings'::regclass
      and pg_get_constraintdef(oid) like '%5%'
  ) then
    alter table public.ratings drop constraint ratings_score_check;
    update public.ratings set score = score * 2;
    alter table public.ratings add constraint ratings_score_check check (score between 1 and 10);
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Helper functions used by the security policies.
-- SECURITY DEFINER lets a policy ask "is this user in this room?" without the
-- policy recursively triggering its own table's policies.
-- ---------------------------------------------------------------------------

create or replace function public.is_room_member(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.room_members
    where room_id = target_room_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.movie_room_id(target_movie_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select room_id from public.movies where id = target_movie_id;
$$;

-- Invite codes: 8 characters, no look-alikes (no 0/O, 1/I/L), built from
-- random bytes. Stored and compared uppercase.
create or replace function public.generate_invite_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  random_bytes bytea;
  code text;
  i integer;
begin
  loop
    random_bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    code := '';
    for i in 0..7 loop
      code := code || substr(alphabet, (get_byte(random_bytes, i) % length(alphabet)) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.rooms where invite_code = code);
  end loop;
  return code;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: create a room and add the caller as its first member, atomically.
-- ---------------------------------------------------------------------------

create or replace function public.create_room(room_name text, member_name text)
returns public.rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  new_room public.rooms;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  insert into public.rooms (name, invite_code)
  values (trim(room_name), public.generate_invite_code())
  returning * into new_room;

  insert into public.room_members (room_id, user_id, display_name)
  values (new_room.id, auth.uid(), trim(member_name));

  return new_room;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: join an existing room by invite code.
-- ---------------------------------------------------------------------------

create or replace function public.join_room(code text, member_name text)
returns public.rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  target_room public.rooms;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  select * into target_room
  from public.rooms
  where invite_code = upper(trim(code));

  if not found then
    raise exception 'That invite code does not match any room';
  end if;

  insert into public.room_members (room_id, user_id, display_name)
  values (target_room.id, auth.uid(), trim(member_name))
  on conflict (room_id, user_id) do nothing;

  return target_room;
end;
$$;

-- Only signed-in users may call the RPCs; anonymous visitors may not.
revoke all on function public.create_room(text, text) from public, anon;
revoke all on function public.join_room(text, text) from public, anon;
grant execute on function public.create_room(text, text) to authenticated;
grant execute on function public.join_room(text, text) to authenticated;
grant execute on function public.is_room_member(uuid) to authenticated;
grant execute on function public.movie_room_id(uuid) to authenticated;
revoke all on function public.generate_invite_code() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Table permissions. The project is created with "Automatically expose new
-- tables" turned OFF, so nothing is reachable until granted here. Only signed-in
-- users get access; anonymous visitors get nothing. Row Level Security below
-- then narrows this further to rows in the user's own room.
-- ---------------------------------------------------------------------------

grant usage on schema public to authenticated;

grant select on public.rooms to authenticated;
grant update (name) on public.rooms to authenticated;

grant select, delete on public.room_members to authenticated;
grant update (display_name) on public.room_members to authenticated;

grant select, insert, update, delete on public.movies to authenticated;
grant select, insert, update, delete on public.ratings to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security: people only ever see rooms they belong to.
-- ---------------------------------------------------------------------------

alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.movies enable row level security;
alter table public.ratings enable row level security;

-- rooms: members can read and rename; creating goes through create_room().
drop policy if exists "rooms: members read" on public.rooms;
create policy "rooms: members read" on public.rooms
  for select to authenticated
  using (public.is_room_member(id));

drop policy if exists "rooms: members rename" on public.rooms;
create policy "rooms: members rename" on public.rooms
  for update to authenticated
  using (public.is_room_member(id))
  with check (public.is_room_member(id));

-- room_members: see everyone in your room; edit or delete only your own row.
drop policy if exists "room_members: read own rooms" on public.room_members;
create policy "room_members: read own rooms" on public.room_members
  for select to authenticated
  using (public.is_room_member(room_id));

drop policy if exists "room_members: edit own row" on public.room_members;
create policy "room_members: edit own row" on public.room_members
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "room_members: leave" on public.room_members;
create policy "room_members: leave" on public.room_members
  for delete to authenticated
  using (user_id = auth.uid());

-- movies: any member of the room can read and manage its movies.
drop policy if exists "movies: members read" on public.movies;
create policy "movies: members read" on public.movies
  for select to authenticated
  using (public.is_room_member(room_id));

drop policy if exists "movies: members add" on public.movies;
create policy "movies: members add" on public.movies
  for insert to authenticated
  with check (public.is_room_member(room_id) and added_by = auth.uid());

drop policy if exists "movies: members update" on public.movies;
create policy "movies: members update" on public.movies
  for update to authenticated
  using (public.is_room_member(room_id))
  with check (public.is_room_member(room_id));

drop policy if exists "movies: members remove" on public.movies;
create policy "movies: members remove" on public.movies
  for delete to authenticated
  using (public.is_room_member(room_id));

-- ratings: everyone in the room can see ratings; you can only write your own.
drop policy if exists "ratings: members read" on public.ratings;
create policy "ratings: members read" on public.ratings
  for select to authenticated
  using (public.is_room_member(public.movie_room_id(movie_id)));

drop policy if exists "ratings: write own" on public.ratings;
create policy "ratings: write own" on public.ratings
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_room_member(public.movie_room_id(movie_id)));

drop policy if exists "ratings: update own" on public.ratings;
create policy "ratings: update own" on public.ratings
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_room_member(public.movie_room_id(movie_id)));

drop policy if exists "ratings: delete own" on public.ratings;
create policy "ratings: delete own" on public.ratings
  for delete to authenticated
  using (user_id = auth.uid());
