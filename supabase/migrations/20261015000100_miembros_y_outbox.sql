-- E0 · Listado de miembros con correo y recuperación de correos trabados en el outbox.

-- Los miembros no pueden leer auth.users; esta función expone solo el correo de
-- quienes comparten estudio con quien consulta.
create or replace function public.list_org_members(p_org_id uuid)
returns table (user_id uuid, email text, role text, joined_at timestamptz)
language plpgsql security definer
set search_path = ''
stable
as $$
begin
  if not private.is_org_member(p_org_id) then
    raise exception 'No tenés acceso a este estudio' using errcode = '42501';
  end if;

  return query
    select m.user_id, u.email::text, m.role, m.created_at
    from public.memberships m
    join auth.users u on u.id = m.user_id
    where m.org_id = p_org_id
    order by m.created_at;
end;
$$;

revoke execute on function public.list_org_members(uuid) from public, anon;
grant execute on function public.list_org_members(uuid) to authenticated;

-- claim_outbox: al tomar un correo se le da un plazo de 10 minutos. Si la función
-- que lo procesa se cae a mitad de camino, el correo vuelve a estar disponible
-- cuando vence ese plazo, en vez de quedar en 'processing' para siempre.
create or replace function public.claim_outbox(p_limit integer default 20)
returns setof public.outbox
language sql security definer
set search_path = ''
as $$
  update public.outbox o
  set status = 'processing',
      attempts = o.attempts + 1,
      next_try_at = now() + interval '10 minutes'
  where o.id in (
    select id from public.outbox
    where status in ('pending', 'processing') and next_try_at <= now()
    order by id
    limit p_limit
    for update skip locked
  )
  returning o.*;
$$;

revoke execute on function public.claim_outbox(integer) from public, anon, authenticated;
grant execute on function public.claim_outbox(integer) to service_role;
