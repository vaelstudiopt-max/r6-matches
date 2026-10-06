alter table public.player_private
  add column if not exists manual_verified_at timestamptz,
  add column if not exists manual_verified_by uuid references public.profiles(id) on delete set null;

create policy player_private_admin_read on public.player_private
  for select to authenticated using (public.is_admin_user());
create policy player_private_self_read on public.player_private
  for select to authenticated using (user_id = auth.uid());

grant select(user_id, discord_id, verified_until, manual_verified_at, manual_verified_by)
  on public.player_private to authenticated;

create function public.admin_set_member_verified(p_user uuid, p_discord_id text, p_verified boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_discord_id text := trim(coalesce(p_discord_id, '')); v_linked_discord_id text;
begin
  if not public.is_admin_user() then raise exception 'Admin only'; end if;
  if not exists(select 1 from public.profiles where id = p_user) then raise exception 'Player not found'; end if;

  if p_verified then
    if v_discord_id !~ '^[0-9]{15,25}$' then raise exception 'Enter a valid Discord user ID'; end if;
    select identity_data->>'sub' into v_linked_discord_id
      from auth.identities where user_id = p_user and provider = 'discord' limit 1;
    if v_linked_discord_id is not null and v_linked_discord_id <> v_discord_id then
      raise exception 'Discord ID does not match the player linked account';
    end if;
    update public.player_private
      set discord_id = v_discord_id, manual_verified_at = now(), manual_verified_by = auth.uid()
      where user_id = p_user;
  else
    update public.player_private
      set manual_verified_at = null, manual_verified_by = null, verified_until = null
      where user_id = p_user;
  end if;
end $$;

revoke all on function public.admin_set_member_verified(uuid,text,boolean) from public,anon;
grant execute on function public.admin_set_member_verified(uuid,text,boolean) to authenticated;

create or replace function public.join_queue(p_mode text, p_format text)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_captain_eligible boolean;
begin
  if v_user is null then raise exception 'Sign in first'; end if;
  if p_mode not in ('captains','random') or p_format not in ('bo1','bo3') then raise exception 'Invalid queue'; end if;
  perform 1 from public.profiles where id=v_user for update;
  if not exists(
    select 1 from public.player_private
    where user_id=v_user and discord_id is not null
      and (verified_until>now() or manual_verified_at is not null)
  ) then raise exception 'Ask an admin to verify your Discord membership first'; end if;
  if not exists(select 1 from public.profiles where id=v_user and length(trim(ubisoft_name))>0) then raise exception 'Add your Ubisoft PC name first'; end if;
  if exists(select 1 from public.match_players mp join public.matches m on m.id=mp.match_id
    where mp.user_id=v_user and m.status in ('draft','waiting_voice','veto','playing','disputed')) then raise exception 'You are already in a match'; end if;
  select captain_opt_in into v_captain_eligible from public.profiles where id=v_user;
  insert into public.queue_entries(user_id,mode,format,captain_eligible)
    values(v_user,p_mode,p_format,v_captain_eligible);
  perform public.maybe_start_batch(p_mode,p_format);
end $$;
