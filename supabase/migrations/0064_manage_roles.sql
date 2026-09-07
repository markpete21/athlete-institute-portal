-- Security root capability. `manage_roles` (edit) gates every change to who is
-- staff and what roles may do: role grants/revokes, the capability matrix,
-- account types. It is seeded on the system Admin role only and is NOT editable
-- from the permissions UI (lib/access/roles.ts refuses), so a role-holder can
-- never grant it to themselves. STAFF_ALLOWLIST_EMAILS remains the bootstrap
-- root until the Admin role is populated.
insert into public.role_capabilities (role_id, capability, can_view, can_edit)
select r.id, 'manage_roles', true, true
from public.roles r
where r.name = 'Admin' and r.is_system
on conflict (role_id, capability) do update set can_view = true, can_edit = true;

-- Access is decided from profiles.status as well as roles (lib/auth.ts):
-- suspended/archived profiles keep their rows but lose admin.* access.
create index if not exists profiles_status_idx on public.profiles (status);
