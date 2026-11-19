-- Distinguish first-time onboarding from an unavailable existing profile.
create or replace function bemo_private.require_actor(lock_row boolean default false)
returns bemo_private.app_users
language plpgsql security definer set search_path = '' as $$
declare
  v_identity record;
  v_actor bemo_private.app_users;
begin
  select * into strict v_identity from bemo_private.trusted_identity();
  if lock_row then
    select u.* into v_actor from bemo_private.app_users u
      where u.auth_subject = v_identity.auth_subject for update;
  else
    select u.* into v_actor from bemo_private.app_users u
      where u.auth_subject = v_identity.auth_subject;
  end if;
  if v_actor.id is null then
    raise exception using errcode = '42501', message = 'BEMO_PROFILE_REQUIRED';
  end if;
  if v_actor.status <> 'ACTIVE' then
    raise exception using errcode = '42501', message = 'BEMO_PROFILE_UNAVAILABLE';
  end if;
  return v_actor;
end;
$$;


