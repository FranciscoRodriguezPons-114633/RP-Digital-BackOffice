-- Sprint 3 · Una orden rechazada se puede corregir y volver a enviar.
-- Antes, update_change_order solo aceptaba borrador o enviada: una orden rechazada solo se
-- podía anular, y para cobrar la versión corregida había que crear otra orden con otro número.
-- Ahora, editar una rechazada la vuelve a borrador (aunque no cambie nada: puede que el
-- estudio lo haya hablado con el cliente y quiera mandársela igual). El rechazo queda en
-- approvals y en la actividad; decided_at se limpia porque la orden vuelve a estar abierta.

create or replace function public.update_change_order(
  p_id uuid, p_stage_id uuid, p_title text, p_description text, p_hours numeric, p_amount numeric,
  p_affected_documents text[] default '{}')
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_co public.change_orders%rowtype;
  v_new_stage public.fee_stages%rowtype;
  v_new_hash text;
  v_revoked integer := 0;
begin
  select * into v_co from public.change_orders where id = p_id for update;
  if not found or not private.is_org_member(v_co.org_id) then
    raise exception 'No tenés acceso a esta orden' using errcode = '42501';
  end if;
  if v_co.status not in ('draft', 'sent', 'rejected') then
    raise exception 'Una orden % no se puede editar', v_co.status using errcode = '22023';
  end if;
  select * into v_new_stage from public.fee_stages where id = p_stage_id;
  if not found or v_new_stage.project_id <> v_co.project_id then
    raise exception 'La etapa tiene que ser del mismo proyecto' using errcode = '23514';
  end if;

  update public.change_orders
  set stage_id = p_stage_id, title = btrim(p_title), description = nullif(btrim(p_description), ''),
      hours = p_hours, amount = p_amount, affected_documents = coalesce(p_affected_documents, '{}')
  where id = p_id
  returning content_hash into v_new_hash;

  if v_new_hash = v_co.content_hash and v_co.status <> 'rejected' then
    return;
  end if;

  if v_co.status = 'sent' then
    update public.change_orders set status = 'draft' where id = p_id;
    update public.approval_links set revoked_at = now()
    where change_order_id = p_id and used_at is null and revoked_at is null;
    get diagnostics v_revoked = row_count;
  elsif v_co.status = 'rejected' then
    update public.change_orders set status = 'draft', decided_at = null where id = p_id;
  end if;

  perform private.log_event(v_co.org_id, 'change_order.updated', 'change_order', p_id,
    jsonb_build_object('project_id', v_co.project_id, 'number', v_co.number, 'title', btrim(p_title),
                       'previous_status', v_co.status,
                       'previous_hash', v_co.content_hash, 'content_hash', v_new_hash,
                       'links_revoked', v_revoked));
end;
$$;

revoke execute on function public.update_change_order(uuid, uuid, text, text, numeric, numeric, text[]) from public, anon;
grant execute on function public.update_change_order(uuid, uuid, text, text, numeric, numeric, text[]) to authenticated;
