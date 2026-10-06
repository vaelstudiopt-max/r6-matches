create function public.admin_member_discord_identities()
returns table(user_id uuid, discord_id text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin_user() then raise exception 'Admin only'; end if;
  return query
    select identity.user_id, identity.identity_data->>'sub'
    from auth.identities identity
    where identity.provider = 'discord'
      and identity.identity_data->>'sub' ~ '^[0-9]{15,25}$';
end $$;

revoke all on function public.admin_member_discord_identities() from public,anon;
grant execute on function public.admin_member_discord_identities() to authenticated;
