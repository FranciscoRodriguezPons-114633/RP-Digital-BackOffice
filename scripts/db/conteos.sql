-- Conteo de filas de las tablas que más importan. Se toma al hacer la copia y otra vez al
-- restaurarla: si no coinciden, la copia no sirve.
select 'auth.users', count(*) from auth.users
union all select 'public.organizations', count(*) from public.organizations
union all select 'public.memberships', count(*) from public.memberships
union all select 'public.projects', count(*) from public.projects
union all select 'public.fee_stages', count(*) from public.fee_stages
union all select 'public.time_entries', count(*) from public.time_entries
union all select 'public.change_orders', count(*) from public.change_orders
union all select 'public.revisions', count(*) from public.revisions
union all select 'public.budgets', count(*) from public.budgets
union all select 'public.budget_items', count(*) from public.budget_items
union all select 'public.events', count(*) from public.events
union all select 'storage.objects', count(*) from storage.objects
order by 1;
