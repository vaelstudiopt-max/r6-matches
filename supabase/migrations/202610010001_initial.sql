create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Recruit',
  ubisoft_name text not null default '',
  captain_opt_in boolean not null default true,
  rating integer not null default 1000,
  wins integer not null default 0,
  losses integer not null default 0,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.player_private (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  discord_id text unique,
  verified_until timestamptz
);

create function public.create_profile() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, display_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), nullif(new.raw_user_meta_data->>'name', ''), 'Recruit'));
  insert into public.player_private(user_id) values (new.id);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.create_profile();

create table public.maps (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  sort_order integer not null
);
insert into public.maps(name, sort_order) values
('Bank',1),('Border',2),('Chalet',3),('Clubhouse',4),('Consulate',5),
('Kafe',6),('Lair',7),('Nighthaven Labs',8),('Fortress',9);

create table public.app_settings (
  id boolean primary key default true check (id),
  general_channel_id text not null default '',
  match_category_id text not null default '',
  staff_role_ids text[] not null default '{}'
);
insert into public.app_settings(id) values (true);

create table public.queue_batches (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('captains','random')),
  format text not null check (format in ('bo1','bo3')),
  status text not null default 'ready' check (status in ('ready','matched','expired')),
  deadline timestamptz not null default now() + interval '30 seconds',
  created_at timestamptz not null default now()
);

create table public.queue_entries (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  mode text not null check (mode in ('captains','random')),
  format text not null check (format in ('bo1','bo3')),
  batch_id uuid references public.queue_batches(id) on delete set null,
  captain_eligible boolean not null default false,
  accepted boolean not null default false,
  joined_at timestamptz not null default now()
);
create index queue_entries_lane on public.queue_entries(mode,format,joined_at) where batch_id is null;

create view public.queue_lane_counts with (security_invoker = false) as
  select mode, format, count(*)::integer as players from public.queue_entries group by mode,format;

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('captains','random')),
  format text not null check (format in ('bo1','bo3')),
  status text not null check (status in ('draft','waiting_voice','veto','playing','disputed','completed','cancelled')),
  draft_step integer not null default 0,
  veto_step integer not null default 0,
  first_veto_team integer not null default 0 check (first_veto_team in (0,1)),
  turn_deadline timestamptz,
  map_pool uuid[] not null,
  voice_a text,
  voice_b text,
  voice_presence jsonb not null default '{}'::jsonb,
  voice_error text,
  winning_team integer check (winning_team in (0,1)),
  rating_applied boolean not null default false,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index matches_active on public.matches(status) where status in ('draft','waiting_voice','veto','playing','disputed');

create table public.match_players (
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  team integer check (team in (0,1)),
  is_captain boolean not null default false,
  is_representative boolean not null default false,
  primary key(match_id,user_id)
);
create index match_players_user on public.match_players(user_id);

create table public.veto_actions (
  match_id uuid not null references public.matches(id) on delete cascade,
  step integer not null,
  team integer not null check (team in (0,1)),
  kind text not null check (kind in ('ban','pick')),
  map_id uuid not null references public.maps(id),
  actor_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key(match_id,step),
  unique(match_id,map_id)
);

create table public.series_maps (
  match_id uuid not null references public.matches(id) on delete cascade,
  slot integer not null check (slot between 1 and 3),
  map_id uuid not null references public.maps(id),
  reported_by uuid references public.profiles(id),
  reported_winner integer check (reported_winner in (0,1)),
  winner_team integer check (winner_team in (0,1)),
  primary key(match_id,slot),
  unique(match_id,map_id)
);

create table public.rating_events (
  match_id uuid not null references public.matches(id),
  user_id uuid not null references public.profiles(id),
  delta integer not null,
  rating_after integer not null,
  created_at timestamptz not null default now(),
  primary key(match_id,user_id)
);

create function public.is_admin_user() returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and is_admin)
$$;

create function public.maybe_start_batch(p_mode text, p_format text) returns void language plpgsql security definer set search_path = public as $$
declare v_ids uuid[]; v_reserved uuid[]; v_remaining uuid[]; v_batch uuid;
begin
  perform pg_advisory_xact_lock(hashtext(p_mode || ':' || p_format));
  if exists(select 1 from public.queue_batches where mode=p_mode and format=p_format and status='ready') then return; end if;
  if p_mode='captains' then
    -- Reserve two volunteer slots, then fill the remaining seats in queue order.
    select array_agg(user_id order by joined_at) into v_reserved from (
      select user_id,joined_at from public.queue_entries
      where mode=p_mode and format=p_format and batch_id is null and captain_eligible
      order by joined_at limit 2
    ) volunteers;
    if coalesce(array_length(v_reserved,1),0)<2 then return; end if;
    select array_agg(user_id order by joined_at) into v_remaining from (
      select user_id,joined_at from public.queue_entries
      where mode=p_mode and format=p_format and batch_id is null
        and user_id<>all(v_reserved)
      order by joined_at limit 8
    ) others;
    if coalesce(array_length(v_remaining,1),0)<8 then return; end if;
    v_ids:=v_reserved || v_remaining;
  else
    select array_agg(user_id order by joined_at) into v_ids from (
      select user_id, joined_at from public.queue_entries
      where mode=p_mode and format=p_format and batch_id is null order by joined_at limit 10
    ) q;
  end if;
  if coalesce(array_length(v_ids,1),0) < 10 then return; end if;
  insert into public.queue_batches(mode,format) values(p_mode,p_format) returning id into v_batch;
  update public.queue_entries set batch_id=v_batch, accepted=false where user_id=any(v_ids);
end $$;

create function public.join_queue(p_mode text, p_format text) returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_captain_eligible boolean;
begin
  if v_user is null then raise exception 'Sign in first'; end if;
  if p_mode not in ('captains','random') or p_format not in ('bo1','bo3') then raise exception 'Invalid queue'; end if;
  perform 1 from public.profiles where id=v_user for update;
  if not exists(select 1 from public.player_private where user_id=v_user and verified_until>now()) then raise exception 'Verify Discord server membership first'; end if;
  if not exists(select 1 from public.profiles where id=v_user and length(trim(ubisoft_name))>0) then raise exception 'Add your Ubisoft PC name first'; end if;
  if exists(select 1 from public.match_players mp join public.matches m on m.id=mp.match_id
    where mp.user_id=v_user and m.status in ('draft','waiting_voice','veto','playing','disputed')) then raise exception 'You are already in a match'; end if;
  select captain_opt_in into v_captain_eligible from public.profiles where id=v_user;
  insert into public.queue_entries(user_id,mode,format,captain_eligible)
    values(v_user,p_mode,p_format,v_captain_eligible);
  perform public.maybe_start_batch(p_mode,p_format);
end $$;

create function public.leave_queue() returns void language plpgsql security definer set search_path = public as $$
declare v_mode text; v_format text; v_batch uuid;
begin
  select mode,format,batch_id into v_mode,v_format,v_batch from public.queue_entries where user_id=auth.uid() for update;
  if not found then return; end if;
  delete from public.queue_entries where user_id=auth.uid();
  if v_batch is not null then
    update public.queue_batches set status='expired' where id=v_batch and status='ready';
    update public.queue_entries set batch_id=null,accepted=false where batch_id=v_batch;
  end if;
  perform public.maybe_start_batch(v_mode,v_format);
end $$;

create function public.accept_ready() returns uuid language plpgsql security definer set search_path = public as $$
declare v_batch public.queue_batches%rowtype; v_match uuid; v_users uuid[]; v_pool uuid[]; v_captains uuid[]; v_user uuid; v_i integer := 0;
begin
  select b.* into v_batch from public.queue_entries q join public.queue_batches b on b.id=q.batch_id
    where q.user_id=auth.uid() for update of b;
  if not found or v_batch.status<>'ready' or v_batch.deadline<=now() then raise exception 'Ready check expired'; end if;
  update public.queue_entries set accepted=true where user_id=auth.uid() and batch_id=v_batch.id;
  if (select count(*) from public.queue_entries where batch_id=v_batch.id and accepted) <> 10 then return null; end if;
  select array_agg(id order by sort_order) into v_pool from public.maps where active;
  if array_length(v_pool,1)<>9 then raise exception 'Nine active maps are required'; end if;
  select array_agg(user_id order by random()) into v_users from public.queue_entries where batch_id=v_batch.id;
  -- Serialize match creation with new queue joins for every selected player.
  perform 1 from public.profiles where id=any(v_users) order by id for update;
  insert into public.matches(mode,format,status,map_pool,first_veto_team,turn_deadline)
  values(v_batch.mode,v_batch.format,case when v_batch.mode='captains' then 'draft' else 'waiting_voice' end,
    v_pool, floor(random()*2)::integer,
    case when v_batch.mode='captains' then now()+interval '60 seconds' else null end)
  returning id into v_match;
  foreach v_user in array v_users loop
    insert into public.match_players(match_id,user_id) values(v_match,v_user);
  end loop;
  if v_batch.mode='captains' then
    select array_agg(id order by random()) into v_captains from (
      select q.user_id as id from public.queue_entries q
      where q.batch_id=v_batch.id and q.captain_eligible order by random() limit 2
    ) c;
    update public.match_players set team=0,is_captain=true,is_representative=true where match_id=v_match and user_id=v_captains[1];
    update public.match_players set team=1,is_captain=true,is_representative=true where match_id=v_match and user_id=v_captains[2];
  else
    foreach v_user in array v_users loop
      update public.match_players set team=case when v_i<5 then 0 else 1 end where match_id=v_match and user_id=v_user;
      v_i:=v_i+1;
    end loop;
    update public.match_players set is_representative=true where match_id=v_match and user_id=v_users[1];
    update public.match_players set is_representative=true where match_id=v_match and user_id=v_users[6];
  end if;
  update public.queue_batches set status='matched' where id=v_batch.id;
  delete from public.queue_entries where batch_id=v_batch.id;
  perform public.maybe_start_batch(v_batch.mode,v_batch.format);
  return v_match;
end $$;

create function public.apply_draft_pick(p_match uuid,p_player uuid) returns void language plpgsql security definer set search_path = public as $$
declare v_match public.matches%rowtype; v_team integer; v_order integer[] := array[0,1,1,0,0,1,0,1];
begin
  select * into v_match from public.matches where id=p_match for update;
  if v_match.status<>'draft' or v_match.draft_step>=8 then raise exception 'Draft is closed'; end if;
  v_team:=v_order[v_match.draft_step+1];
  update public.match_players set team=v_team where match_id=p_match and user_id=p_player and team is null;
  if not found then raise exception 'Player is unavailable'; end if;
  update public.matches set draft_step=draft_step+1,
    status=case when draft_step+1=8 then 'waiting_voice' else 'draft' end,
    turn_deadline=case when draft_step+1=8 then null else now()+interval '60 seconds' end where id=p_match;
end $$;

create function public.draft_pick(p_match uuid,p_player uuid) returns void language plpgsql security definer set search_path = public as $$
declare v_match public.matches%rowtype; v_order integer[] := array[0,1,1,0,0,1,0,1]; v_team integer;
begin
  select * into v_match from public.matches where id=p_match for update;
  if v_match.status<>'draft' or v_match.turn_deadline<=now() then raise exception 'Draft turn expired'; end if;
  v_team:=v_order[v_match.draft_step+1];
  if not exists(select 1 from public.match_players where match_id=p_match and user_id=auth.uid() and team=v_team and is_captain) then raise exception 'Not your pick'; end if;
  perform public.apply_draft_pick(p_match,p_player);
end $$;

create function public.apply_veto(p_match uuid,p_map uuid,p_actor uuid) returns void language plpgsql security definer set search_path = public as $$
declare v_match public.matches%rowtype; v_team integer; v_kind text; v_left uuid; v_pick_a uuid; v_pick_b uuid;
begin
  select * into v_match from public.matches where id=p_match for update;
  if v_match.status<>'veto' or v_match.veto_step>=8 then raise exception 'Veto is closed'; end if;
  if not p_map=any(v_match.map_pool) then raise exception 'Map is outside this match pool'; end if;
  v_team:=(v_match.first_veto_team+v_match.veto_step)%2;
  v_kind:=case when v_match.format='bo3' and v_match.veto_step in (4,5) then 'pick' else 'ban' end;
  insert into public.veto_actions(match_id,step,team,kind,map_id,actor_id)
    values(p_match,v_match.veto_step+1,v_team,v_kind,p_map,p_actor);
  update public.matches set veto_step=veto_step+1, turn_deadline=case when veto_step+1=8 then null else now()+interval '60 seconds' end,
    status=case when veto_step+1=8 then 'playing' else 'veto' end where id=p_match;
  if v_match.veto_step=7 then
    select x into v_left from unnest(v_match.map_pool) x where not exists(select 1 from public.veto_actions where match_id=p_match and map_id=x);
    if v_match.format='bo1' then
      insert into public.series_maps(match_id,slot,map_id) values(p_match,1,v_left);
    else
      select map_id into v_pick_a from public.veto_actions where match_id=p_match and step=5;
      select map_id into v_pick_b from public.veto_actions where match_id=p_match and step=6;
      insert into public.series_maps(match_id,slot,map_id) values(p_match,1,v_pick_a),(p_match,2,v_pick_b),(p_match,3,v_left);
    end if;
  end if;
end $$;

create function public.veto_map(p_match uuid,p_map uuid) returns void language plpgsql security definer set search_path = public as $$
declare v_match public.matches%rowtype; v_team integer;
begin
  select * into v_match from public.matches where id=p_match for update;
  if v_match.status<>'veto' or v_match.turn_deadline<=now() then raise exception 'Veto turn expired'; end if;
  v_team:=(v_match.first_veto_team+v_match.veto_step)%2;
  if not exists(select 1 from public.match_players where match_id=p_match and user_id=auth.uid() and team=v_team and is_representative) then raise exception 'Not your turn'; end if;
  perform public.apply_veto(p_match,p_map,auth.uid());
end $$;

create function public.finalize_match(p_match uuid,p_winner integer) returns void language plpgsql security definer set search_path = public as $$
declare v_match public.matches%rowtype; v_a numeric; v_b numeric; v_delta_a integer; v_delta_b integer; v_player record; v_delta integer;
begin
  select * into v_match from public.matches where id=p_match for update;
  if v_match.rating_applied then return; end if;
  if p_winner not in (0,1) then raise exception 'Invalid winning team'; end if;
  select avg(p.rating) into v_a from public.match_players mp join public.profiles p on p.id=mp.user_id where mp.match_id=p_match and mp.team=0;
  select avg(p.rating) into v_b from public.match_players mp join public.profiles p on p.id=mp.user_id where mp.match_id=p_match and mp.team=1;
  v_delta_a:=round(32*((case when p_winner=0 then 1 else 0 end)-1/(1+power(10,(v_b-v_a)/400))))::integer;
  v_delta_b:=-v_delta_a;
  for v_player in select * from public.match_players where match_id=p_match loop
    v_delta:=case when v_player.team=0 then v_delta_a else v_delta_b end;
    update public.profiles set rating=rating+v_delta,
      wins=wins+case when v_player.team=p_winner then 1 else 0 end,
      losses=losses+case when v_player.team<>p_winner then 1 else 0 end
      where id=v_player.user_id;
    insert into public.rating_events(match_id,user_id,delta,rating_after)
      select p_match,v_player.user_id,v_delta,rating from public.profiles where id=v_player.user_id;
  end loop;
  update public.matches set status='completed',winning_team=p_winner,rating_applied=true,completed_at=now() where id=p_match;
end $$;

create function public.report_map(p_match uuid,p_slot integer,p_winner integer) returns void language plpgsql security definer set search_path = public as $$
declare v_match public.matches%rowtype;
begin
  select * into v_match from public.matches where id=p_match for update;
  if v_match.status<>'playing' or p_winner not in (0,1) then raise exception 'Cannot report this result'; end if;
  if not exists(select 1 from public.match_players where match_id=p_match and user_id=auth.uid() and is_representative) then raise exception 'Only team representatives can report'; end if;
  if p_slot<>(select min(slot) from public.series_maps where match_id=p_match and winner_team is null) then raise exception 'Report the current map'; end if;
  update public.series_maps set reported_by=auth.uid(),reported_winner=p_winner
    where match_id=p_match and slot=p_slot and reported_by is null;
  if not found then raise exception 'Result already awaiting confirmation'; end if;
end $$;

create function public.confirm_map(p_match uuid,p_slot integer,p_accept boolean) returns void language plpgsql security definer set search_path = public as $$
declare v_match public.matches%rowtype; v_map public.series_maps%rowtype; v_report_team integer; v_wins integer;
begin
  select * into v_match from public.matches where id=p_match for update;
  if v_match.status<>'playing' then raise exception 'Match is not playing'; end if;
  select * into v_map from public.series_maps where match_id=p_match and slot=p_slot for update;
  if v_map.reported_by is null or v_map.winner_team is not null then raise exception 'No report to confirm'; end if;
  select team into v_report_team from public.match_players where match_id=p_match and user_id=v_map.reported_by;
  if not exists(select 1 from public.match_players where match_id=p_match and user_id=auth.uid() and is_representative and team<>v_report_team) then raise exception 'Opposing representative must confirm'; end if;
  if not p_accept then update public.matches set status='disputed' where id=p_match; return; end if;
  update public.series_maps set winner_team=reported_winner where match_id=p_match and slot=p_slot;
  select count(*) into v_wins from public.series_maps where match_id=p_match and winner_team=v_map.reported_winner;
  if v_match.format='bo1' or v_wins>=2 then perform public.finalize_match(p_match,v_map.reported_winner); end if;
end $$;

create function public.admin_resolve(p_match uuid,p_action text,p_winner integer default null) returns void language plpgsql security definer set search_path = public as $$
declare v_match public.matches%rowtype; v_slot integer; v_wins integer;
begin
  if not public.is_admin_user() then raise exception 'Admin only'; end if;
  select * into v_match from public.matches where id=p_match for update;
  if v_match.status not in ('draft','waiting_voice','veto','playing','disputed') then raise exception 'Match already closed'; end if;
  if p_action='cancel' then
    update public.matches set status='cancelled',cancellation_reason='Cancelled by admin',completed_at=now() where id=p_match;
  elsif p_action='forfeit' then
    if exists(select 1 from public.match_players where match_id=p_match and team is null) then
      raise exception 'Cancel an incomplete draft instead of awarding a forfeit';
    end if;
    perform public.finalize_match(p_match,p_winner);
  elsif p_action='resolve_map' and v_match.status='disputed' then
    if p_winner not in (0,1) or p_winner is null then raise exception 'Choose Team A or Team B'; end if;
    select min(slot) into v_slot from public.series_maps where match_id=p_match and reported_by is not null and winner_team is null;
    update public.series_maps set winner_team=p_winner where match_id=p_match and slot=v_slot;
    update public.matches set status='playing' where id=p_match;
    select count(*) into v_wins from public.series_maps where match_id=p_match and winner_team=p_winner;
    if v_match.format='bo1' or v_wins>=2 then perform public.finalize_match(p_match,p_winner); end if;
  elsif p_action='retry_voice' and v_match.status='waiting_voice' then
    update public.matches set voice_error=null where id=p_match;
  else raise exception 'Invalid admin action'; end if;
end $$;

create function public.admin_save_settings(p_general text,p_category text,p_staff text[]) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_user() then raise exception 'Admin only'; end if;
  if trim(p_general) !~ '^[0-9]{15,25}$' or (trim(p_category)<>'' and trim(p_category) !~ '^[0-9]{15,25}$') then
    raise exception 'Discord channel IDs must be numeric';
  end if;
  if exists(select 1 from unnest(p_staff) id where id !~ '^[0-9]{15,25}$') then
    raise exception 'Discord role IDs must be numeric';
  end if;
  update public.app_settings set general_channel_id=trim(p_general),match_category_id=trim(p_category),staff_role_ids=p_staff where id=true;
end $$;

create function public.admin_set_map(p_map uuid,p_active boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_user() then raise exception 'Admin only'; end if;
  update public.maps set active=p_active where id=p_map;
  if not found then raise exception 'Map not found'; end if;
end $$;

create function public.admin_add_map(p_name text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_user() then raise exception 'Admin only'; end if;
  if length(trim(p_name))<2 or length(trim(p_name))>60 then raise exception 'Map name must be 2 to 60 characters'; end if;
  insert into public.maps(name,sort_order,active)
  values(trim(p_name),coalesce((select max(sort_order)+1 from public.maps),1),false);
end $$;

create function public.admin_set_moderator(p_user uuid,p_enabled boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_user() then raise exception 'Admin only'; end if;
  if not p_enabled and p_user=auth.uid() and (select count(*) from public.profiles where is_admin)=1 then
    raise exception 'At least one admin is required';
  end if;
  update public.profiles set is_admin=p_enabled where id=p_user;
  if not found then raise exception 'Player not found'; end if;
end $$;

create function public.process_timeouts() returns void language plpgsql security definer set search_path = public as $$
declare v_batch record; v_match record; v_player uuid; v_map uuid; v_mode text; v_format text;
begin
  for v_batch in select * from public.queue_batches where status='ready' and deadline<=now() for update skip locked loop
    update public.queue_batches set status='expired' where id=v_batch.id;
    delete from public.queue_entries where batch_id=v_batch.id and not accepted;
    update public.queue_entries set batch_id=null,accepted=false where batch_id=v_batch.id;
    perform public.maybe_start_batch(v_batch.mode,v_batch.format);
  end loop;
  for v_match in select * from public.matches where status in ('draft','veto') and turn_deadline<=now() for update skip locked loop
    if v_match.status='draft' then
      select user_id into v_player from public.match_players where match_id=v_match.id and team is null order by random() limit 1;
      perform public.apply_draft_pick(v_match.id,v_player);
    else
      select x into v_map from unnest(v_match.map_pool) x where not exists(select 1 from public.veto_actions where match_id=v_match.id and map_id=x) order by random() limit 1;
      perform public.apply_veto(v_match.id,v_map,null);
    end if;
  end loop;
  for v_mode,v_format in select distinct mode,format from public.queue_entries where batch_id is null loop
    perform public.maybe_start_batch(v_mode,v_format);
  end loop;
end $$;

alter table public.profiles enable row level security;
alter table public.player_private enable row level security;
alter table public.maps enable row level security;
alter table public.app_settings enable row level security;
alter table public.queue_batches enable row level security;
alter table public.queue_entries enable row level security;
alter table public.matches enable row level security;
alter table public.match_players enable row level security;
alter table public.veto_actions enable row level security;
alter table public.series_maps enable row level security;
alter table public.rating_events enable row level security;

create policy profiles_read on public.profiles for select to anon,authenticated using (true);
create policy profiles_self_update on public.profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid());
create policy maps_read on public.maps for select to anon,authenticated using (true);
create policy batches_read on public.queue_batches for select to authenticated using (true);
create policy queue_read on public.queue_entries for select to authenticated using (true);
create policy matches_read on public.matches for select to anon,authenticated using (true);
create policy match_players_read on public.match_players for select to anon,authenticated using (true);
create policy veto_read on public.veto_actions for select to anon,authenticated using (true);
create policy series_maps_read on public.series_maps for select to anon,authenticated using (true);
create policy rating_read on public.rating_events for select to anon,authenticated using (true);
create policy settings_admin_read on public.app_settings for select to authenticated using (public.is_admin_user());

revoke all on all tables in schema public from anon,authenticated;
grant select on public.profiles,public.maps,public.matches,public.match_players,public.veto_actions,public.series_maps,public.rating_events to anon,authenticated;
grant select on public.queue_lane_counts to anon,authenticated;
grant select on public.queue_entries,public.queue_batches,public.app_settings to authenticated;
grant update(display_name,ubisoft_name,captain_opt_in) on public.profiles to authenticated;
revoke all on function public.apply_draft_pick(uuid,uuid),public.apply_veto(uuid,uuid,uuid),public.finalize_match(uuid,integer),public.maybe_start_batch(text,text),public.create_profile(),public.process_timeouts() from public,anon,authenticated;
grant execute on function public.process_timeouts() to service_role;
grant execute on function public.join_queue(text,text),public.leave_queue(),public.accept_ready(),public.draft_pick(uuid,uuid),public.veto_map(uuid,uuid),public.report_map(uuid,integer,integer),public.confirm_map(uuid,integer,boolean),public.admin_resolve(uuid,text,integer),public.admin_save_settings(text,text,text[]),public.admin_set_map(uuid,boolean),public.admin_add_map(text),public.admin_set_moderator(uuid,boolean) to authenticated;

alter publication supabase_realtime add table public.queue_entries,public.queue_batches,public.matches,public.match_players,public.veto_actions,public.series_maps,public.profiles;
