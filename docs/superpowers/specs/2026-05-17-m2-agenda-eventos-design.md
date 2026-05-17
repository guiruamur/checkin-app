# M2 — Agenda y Eventos: Diseño

**Fecha**: 2026-05-17
**Estado**: Spec aprobado, pendiente de plan de implementación
**Autor**: Germán (con asistencia de Claude)
**Predecesor**: `2026-05-16-checkin-app-design.md` (spec maestro) + `2026-05-16-m1-fundacion.md` (plan M1)

## 1. Contexto y objetivo

M2 construye sobre los fundamentos del M1 (auth admin, RLS multi-tenant, deploy continuo) el **ciclo completo de planificación previa al evento**:

- Los trabajadores se auto-registran como candidatos en una URL pública por empresa.
- El admin aprueba o rechaza candidaturas, gestionando su agenda.
- El admin gestiona el catálogo de clientes finales.
- El admin crea eventos, asigna trabajadores con horarios individuales (admite horario partido), genera el QR del evento y envía la confirmación al organizador con un PDF imprimible.

Al cerrar M2, **todo el setup necesario para el flujo del trabajador (M3) está listo**. M3 podrá implementar `/e/:token` consumiendo los `events` y `event_assignments` creados aquí.

### Objetivos no funcionales

- Mantener el coste arrancado en 0 € durante M2 (free tiers de Supabase, Cloudflare, Resend).
- Atomicidad en flujos críticos (signup admin, registro candidato) — sin rows huérfanas si algo falla.
- RLS performante (claim JWT en vez de lookup) preparado para escalar tras M3-M5.
- UX administrativa para usuarios poco técnicos (formularios simples, single-page, sin wizards).

### Fuera de alcance (deferido a milestones posteriores)

- Flujo de fichaje del trabajador (`/e/:token`, check-in/out, geolocalización) → **M3**.
- Alertas automáticas pg_cron + emails de salida retrasada → **M4**.
- Dashboard live, reportes con export Excel/PDF, auditoría visible → **M5**.
- Email confirmation de admin (sigue desactivado en Supabase). Plan documentado en project memory `project_pending_email_verification.md`.
- DNI, NSS, dirección fiscal en workers y clients (extensiones pre-producción real). Plan documentado en `project_pre_production_data_extensions.md`.
- Bulk actions sobre candidatos (aprobar varios a la vez), captcha visible, auto-envío de confirmación de evento — diferidos a iteraciones futuras si la operativa lo pide.

## 2. Estructura por fases

```
FASE 0 — Prereqs M1 (arquitectónicos, blockers)
  • Auth Hook custom_access_token_hook → inyecta company_id en JWT
  • Migración de RLS de current_company_id() a (auth.jwt() ->> 'company_id')::uuid
  • ALTER audit_log.actor_id → nullable (Edge Functions con service_role no tienen auth.uid())
  • Función log_audit_event() (trigger genérico que las fases siguientes adjuntan a sus tablas)
  • Edge Function signup-admin (reemplaza el RPC actual, atómica)
  • Fix race en AuthProvider (quitar setLoading(false) duplicado)
  • Test pgTAP signup atómico

FASE 1 — Workers / Agenda
  • Tabla workers (con languages text[], experience_summary text)
  • Edge Functions: company-by-slug, request-worker-registration, verify-worker-registration
  • Setup Resend + 2 templates (worker-verification, worker-approved)
  • Rutas públicas: /candidato/registro, /candidato/verificar, /candidato/gracias
  • Admin: /admin/agenda con pestañas Aprobados/Pendientes + toggle archivados + ficha del worker

FASE 2 — Clients
  • Tabla clients (con phone, notes)
  • Admin: /admin/clientes (lista + CRUD + buscador + archivado)

FASE 3 — Events + QR
  • Tablas events + event_assignments (sin UNIQUE en assignments → horario partido)
  • Admin: /admin/eventos (lista) + /admin/eventos/nuevo (form single-page) + /admin/eventos/:id (detalle)
  • Edge Function send-event-confirmation (PDF + email a organizador)
  • Audit log poblado en TODAS las mutaciones admin
```

**Orden no negociable**: Fase 0 ANTES de cualquier tabla nueva. La migración a JWT claim es invasiva si llega después, porque cada tabla nueva nace con RLS y nos haría reescribir todas las políticas.

## 3. Modelo de datos

### Cambios sobre tablas existentes (Fase 0)

```sql
-- 1. Migrar RLS de audit_log al claim JWT
DROP POLICY audit_log_tenant_read ON public.audit_log;
CREATE POLICY audit_log_tenant_read ON public.audit_log
  FOR SELECT TO authenticated
  USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

-- 2. Hacer audit_log.actor_id nullable
-- Edge Functions con service_role no tienen auth.uid().
-- NULL = acción del sistema (Edge Function, cron, etc.).
ALTER TABLE public.audit_log
  ALTER COLUMN actor_id DROP NOT NULL;

-- 3. admin_users.id sigue siendo el FK a auth.users; sin cambios estructurales.
--    La función current_company_id() se queda como helper para casos puntuales
--    (uso desde service_role en Edge Functions) pero las políticas RLS ya no
--    dependen de ella.

-- 4. Función trigger genérica para auditar mutaciones DML.
--    Se define en Fase 0 para que cada fase posterior la adjunte a sus tablas.
CREATE OR REPLACE FUNCTION public.log_audit_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_actor_id uuid := auth.uid();
  v_entity_id uuid;
  v_diff jsonb;
BEGIN
  -- Resolver company_id según la tabla
  IF TG_TABLE_NAME = 'event_assignments' THEN
    SELECT company_id INTO v_company_id
    FROM public.events
    WHERE id = COALESCE(NEW.event_id, OLD.event_id);
  ELSE
    v_company_id := COALESCE(NEW.company_id, OLD.company_id);
  END IF;

  v_entity_id := COALESCE(NEW.id, OLD.id);

  IF TG_OP = 'INSERT' THEN
    v_diff := jsonb_build_object('after', to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    v_diff := jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW));
  ELSIF TG_OP = 'DELETE' THEN
    v_diff := jsonb_build_object('before', to_jsonb(OLD));
  END IF;

  INSERT INTO public.audit_log (company_id, actor_id, action, entity_type, entity_id, diff)
  VALUES (
    v_company_id,
    v_actor_id,
    TG_TABLE_NAME || '.' || lower(TG_OP),
    TG_TABLE_NAME,
    v_entity_id,
    v_diff
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;
```

### Tablas nuevas

```sql
-- WORKERS
create table public.workers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  email text not null,
  phone text not null,
  first_name text not null,
  last_name text not null,
  postal_code text,
  languages text[] not null default '{}',
  experience_summary text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'archived')),
  approved_at timestamptz,
  approved_by uuid references public.admin_users (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index workers_company_email_unique
  on public.workers (company_id, lower(email))
  where archived_at is null;

create index workers_company_status_idx
  on public.workers (company_id, status);

alter table public.workers enable row level security;

create policy workers_tenant on public.workers
  for all to authenticated
  using (company_id = (auth.jwt() ->> 'company_id')::uuid);

create trigger workers_audit
  after insert or update or delete on public.workers
  for each row execute function public.log_audit_event();

-- CLIENTS
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  contact_email text not null,
  phone text,
  notes text,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create index clients_company_idx on public.clients (company_id)
  where archived_at is null;

alter table public.clients enable row level security;

create policy clients_tenant on public.clients
  for all to authenticated
  using (company_id = (auth.jwt() ->> 'company_id')::uuid);

create trigger clients_audit
  after insert or update or delete on public.clients
  for each row execute function public.log_audit_event();

-- EVENTS
create table public.events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete restrict,
  name text not null,
  address text not null,
  organizer_email text not null,
  access_token uuid not null unique default gen_random_uuid(),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  last_confirmation_sent_at timestamptz,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  check (ends_at > starts_at)
);

create index events_company_starts_idx on public.events (company_id, starts_at desc);
create index events_access_token_idx on public.events (access_token);

alter table public.events enable row level security;

create policy events_tenant on public.events
  for all to authenticated
  using (company_id = (auth.jwt() ->> 'company_id')::uuid);

create trigger events_audit
  after insert or update or delete on public.events
  for each row execute function public.log_audit_event();

-- EVENT_ASSIGNMENTS
create table public.event_assignments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  worker_id uuid not null references public.workers (id) on delete restrict,
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  created_at timestamptz not null default now(),
  check (scheduled_end > scheduled_start)
);

create index event_assignments_event_idx on public.event_assignments (event_id, scheduled_start);
create index event_assignments_worker_idx on public.event_assignments (worker_id);

alter table public.event_assignments enable row level security;

create policy event_assignments_tenant on public.event_assignments
  for all to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = event_assignments.event_id
        and e.company_id = (auth.jwt() ->> 'company_id')::uuid
    )
  );

create trigger event_assignments_audit
  after insert or update or delete on public.event_assignments
  for each row execute function public.log_audit_event();
```

### Política de auditoría (resumen)

- **DML automático**: el trigger `log_audit_event` registra TODA mutación INSERT/UPDATE/DELETE sobre `workers`, `clients`, `events`, `event_assignments` con `action = '<tabla>.<insert|update|delete>'` y `diff` jsonb con before/after.
- **Eventos semánticos**: las Edge Functions añaden filas explícitas en `audit_log` para acciones que no son 1:1 con DML — por ejemplo `'event.confirmation_sent'` cuando se envía el email al organizador (este envío también dispara un UPDATE sobre `events.last_confirmation_sent_at` que el trigger ya audita, pero la fila semántica adicional facilita la visualización en el M5).

### Notas sobre el modelo

- **UNIQUE parcial sobre `workers (company_id, lower(email))`**: solo aplica cuando `archived_at IS NULL`. Permite re-registrar tras archivar; bloquea email duplicado en estados pending/approved/rejected. Si un rechazado quiere volver a aplicar, el admin debe archivarlo primero. `lower(email)` evita duplicados por casing.
- **`workers.languages text[]`**: valores son strings (ej. `'español'`, `'inglés'`). Validación de la lista permitida ocurre en el cliente y en las Edge Functions (no hay constraint a nivel DB porque la lista puede ampliarse en el futuro sin migración).
- **`events.client_id ON DELETE RESTRICT`**: no permite eliminar un cliente que tiene eventos asociados (el cliente debe archivarse, sus eventos quedan referenciando al cliente archivado).
- **`event_assignments.worker_id ON DELETE RESTRICT`**: igual que arriba — no se pueden borrar workers con asignaciones. Soft delete vía archived_at.
- **`events.access_token UUID v4 con default `gen_random_uuid()`**: generado server-side automáticamente al INSERT. Suficiente entropía (122 bits) para que no sea adivinable.
- **`events` checks (`ends_at > starts_at`)** y análogos en `event_assignments`: garantizan datos coherentes a nivel DB.
- **Sin UNIQUE en `event_assignments(event_id, worker_id)`**: explícitamente permite múltiples filas del mismo worker en el mismo evento (horario partido).

## 4. Flujos de usuario

### 4.1 Signup del admin (refactor Fase 0)

Reemplaza el flujo M1 (`supabase.auth.signUp` + RPC) por una sola llamada atómica a una Edge Function `signup-admin`:

1. Frontend `/signup`: form igual que M1 (4 campos: companyName, fullName, email, password).
2. Submit → `POST /functions/v1/signup-admin` con `{ email, password, company_name, full_name }`.
3. Edge Function (Deno, `service_role`):
   - Valida inputs con Zod.
   - `supabase.auth.admin.createUser({ email, password, email_confirm: true })`.
   - Dentro de una transacción Postgres: INSERT en `companies` + INSERT en `admin_users`.
   - Si CUALQUIER paso falla: rollback de la transacción + `supabase.auth.admin.deleteUser(...)`. Devuelve error tipado: `"email_taken"`, `"slug_collision"`, `"validation"`, `"server"`.
   - Si todo OK: genera sesión y devuelve `{ session }`.
4. Frontend: `supabase.auth.setSession(session)` → navigate `/admin`.

### 4.2 Registro del candidato (double opt-in)

1. Candidato abre `/candidato/registro?company=eventos-perez-l2m4k7`.
2. SPA llama `GET /functions/v1/company-by-slug?slug=eventos-perez-l2m4k7`:
   - 200 con `{ name }` si existe → SPA muestra header "Inscribirme en Eventos Pérez" y el form.
   - 404 si no existe → "Empresa no encontrada".
3. Candidato rellena form (7 campos: name, last_name, email, phone, postal_code opcional, languages multi-select, experience_summary opcional ≤500 chars). Honeypot oculto (input que debe quedar vacío).
4. Submit → `POST /functions/v1/request-worker-registration`:
   - Valida Zod (incluye honeypot empty).
   - Rate limit por IP: 5 reqs / 10 min.
   - Resuelve `company_id` desde slug.
   - Genera JWT firmado HS256 con secret de Supabase: `{ form_data, company_id, exp: now+24h }`.
   - Llama Resend → email a la dirección del candidato con enlace `https://<dominio>/candidato/verificar?token=<jwt>`.
   - Responde 200 vacío (sin filtración de existencia de email).
5. SPA navega a `/candidato/registro-enviado` (pantalla intermedia): "Te hemos enviado un email a `<email>` para confirmar tu inscripción".
6. Candidato abre email, click → `/candidato/verificar?token=<jwt>`.
7. SPA llama `POST /functions/v1/verify-worker-registration` con `{ token }`:
   - Valida JWT (firma + exp).
   - `SELECT FROM workers WHERE company_id = X AND lower(email) = lower(Y) AND archived_at IS NULL`.
     - Si NO existe → INSERT con `status='pending'` + INSERT en `audit_log` con `action='worker.candidate_registered'`.
     - Si existe → no-op idempotente.
   - Responde 200 con `{ company_name }`.
8. SPA muestra `/candidato/gracias`: "Gracias por inscribirte a **{company_name}**. Estudiaremos tu candidatura y nos pondremos en contacto pronto".

**Casos borde:**
- Token caducado: SPA muestra "Este enlace ha caducado. Vuelve a empezar el registro" con link a `/candidato/registro?company=<slug>` (slug embebido en el JWT también, así que recuperable).
- Token con firma inválida: error 400, SPA muestra "Enlace no válido".
- Múltiples emails (candidato se registra dos veces sin confirmar): cualquier click funciona; el primero crea la fila, los demás son no-op silenciosos.

### 4.3 Aprobación / rechazo del candidato (admin)

1. Admin entra a `/admin/agenda`. Por defecto pestaña "Aprobados".
2. Pestaña "Pendientes (N)" muestra todos los `status='pending'` con badge N en el tab.
3. Por cada fila: acciones `[Aprobar]` `[Rechazar]` `[Ver ficha]`.
4. Click `[Aprobar]`:
   - `POST /functions/v1/approve-worker` con `{ worker_id }` (Edge Function porque también envía email).
   - Edge Function: UPDATE workers SET status='approved', approved_at=now(), approved_by=auth.uid() → INSERT audit_log action='worker.approved' → Resend email "Hola {nombre}, te hemos aprobado".
   - UI: fila se mueve a "Aprobados" con optimistic update.
5. Click `[Rechazar]`:
   - PATCH directo a Supabase (RLS lo permite): UPDATE workers SET status='rejected'.
   - Trigger DB inserta automáticamente fila en audit_log.
   - NO se envía email al candidato (silencio en rechazo).
6. Click `[Ver ficha]`: navega a `/admin/agenda/:worker_id` con detalles + experience_summary + idiomas + acciones (editar campos básicos, archivar).
7. Toggle "Mostrar archivados" arriba de cada pestaña → añade los `archived_at IS NOT NULL` al listado.

### 4.4 CRUD de clientes

Estándar:
- `/admin/clientes`: lista (tabla con buscador por nombre), botón "+ Nuevo cliente".
- Form modal o página: name, contact_email, phone (opcional), notes (opcional).
- Por fila: editar (modal), archivar (confirm dialog).
- Toggle "Mostrar archivados".

Cada mutación dispara INSERT en audit_log con `action='client.{created|updated|archived}'`.

### 4.5 Crear evento + envío de confirmación

1. `/admin/eventos`: lista con filtros por estado (próximos / pasados / archivados), botón "+ Nuevo evento".
2. Click → `/admin/eventos/nuevo`: single-page form.

   **Bloque 1 — Datos del evento** (siempre visible):
   - Nombre (text)
   - Cliente (dropdown searchable con clients no archivados + "+ Nuevo cliente" inline → modal)
   - Email organizador (pre-rellenado desde el cliente, editable)
   - Dirección (text — autocompletado Nominatim si llegamos a tiempo, sino libre)
   - starts_at, ends_at (datetime pickers)

   **Bloque 2 — Trabajadores asignados** (colapsable, abierto por defecto):
   - Mini-toolbar: dos time inputs + checkbox "Seleccionar todos" + botón "Aplicar horario a seleccionados".
   - Buscador sobre workers (status='approved', archived_at IS NULL).
   - Lista de asignados: por fila → checkbox + nombre + scheduled_start + scheduled_end (pre-rellenados con event's starts_at/ends_at) + botón "Duplicar fila" (para horario partido) + "Quitar".

3. Submit:
   - INSERT events (auto-genera access_token UUID v4).
   - INSERT múltiple event_assignments.
   - INSERT audit_log.
   - Redirige a `/admin/eventos/:id`.

4. Pantalla de detalle `/admin/eventos/:id`:
   - Datos del evento (editables con botón Edit que reabre el form).
   - QR del evento client-side (`qrcode.react`) con URL `https://<dominio>/e/<access_token>`.
   - Lista de asignaciones (read-only resumida).
   - Botón "Enviar confirmación al organizador". Si `last_confirmation_sent_at IS NOT NULL`, etiqueta debajo: "Última vez enviado: hace 3h" y botón cambia a "Reenviar confirmación".

5. Click "Enviar confirmación":
   - Si ya se envió antes: confirm dialog "¿Reenviar la confirmación al organizador?".
   - `POST /functions/v1/send-event-confirmation` con `{ event_id }`.
   - Edge Function:
     - Valida que el event pertenece al tenant via RLS.
     - Carga datos completos del evento + assignments + worker names.
     - Genera PDF A4 con `pdf-lib`: header empresa, datos del evento, lista de trabajadores, QR grande, URL en texto.
     - Resend send: cuerpo HTML (resumen + QR PNG inline base64) + PDF adjunto.
     - UPDATE events SET last_confirmation_sent_at = now().
     - INSERT audit_log action='event.confirmation_sent'.
   - UI: toast "Confirmación enviada a organizer@cliente.com".

## 5. Seguridad

### 5.1 Migración del modelo RLS al claim JWT

**Antes (M1)**: políticas usan `current_company_id()` (lookup en `admin_users` por query).
**Después (M2)**: políticas usan `(auth.jwt() ->> 'company_id')::uuid` (lectura del claim — sin query extra).

**Cómo se pobla el claim**: Supabase Auth Hook tipo `customize_access_token`:

```sql
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_claims jsonb;
begin
  select company_id into v_company_id
  from public.admin_users
  where id = (event->>'user_id')::uuid;

  v_claims := event->'claims';

  if v_company_id is not null then
    v_claims := jsonb_set(v_claims, '{company_id}', to_jsonb(v_company_id::text));
  end if;

  return jsonb_set(event, '{claims}', v_claims);
end;
$$;

grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;
```

Registrar el hook en `supabase/config.toml`:

```toml
[auth.hook.custom_access_token]
enabled = true
uri = "pg-functions://postgres/public/custom_access_token_hook"
```

Tras la primera sesión post-migración, todos los JWTs de admin llevan `company_id`. Para sesiones activas, hacer `supabase.auth.refreshSession()` al cargar la app post-deploy.

### 5.2 Atomicidad del signup admin (Fase 0, fix Issue 1)

Edge Function `signup-admin` envuelve `auth.admin.createUser` + INSERT companies + INSERT admin_users. Cualquier fallo dispara `auth.admin.deleteUser` + rollback de la transacción Postgres. Resultado: cero rows huérfanas en `auth.users` por fallos parciales.

### 5.3 Edge Functions públicas (registro de candidato)

| Función | JWT requerido | Mitigaciones |
|---|---|---|
| `company-by-slug` | No | Devuelve solo `name`. No leakea conteos ni emails. Rate limit 30 req/min por IP. |
| `request-worker-registration` | No | Honeypot field. Rate limit 5 req/10min por IP. JWT generado tiene TTL 24h. |
| `verify-worker-registration` | No (usa JWT del token del email) | JWT firmado con secret de Supabase. Verificación de firma + exp. INSERT idempotente (no leakea existencia). |
| `approve-worker` | Sí (admin) | RLS bloquea workers de otros tenants. |
| `send-event-confirmation` | Sí (admin) | RLS bloquea eventos de otros tenants. Rate limit por admin: 1 envío cada 30 segundos (anti-spam manual). |

### 5.4 Datos personales y RGPD

Sin cambios estructurales respecto a M1:
- Email, teléfono, idiomas, experiencia → datos personales protegidos por RLS.
- `experience_summary` puede contener datos sensibles si el candidato lo escribe; aceptable porque es opt-in.
- Geolocalización (en M3) ya no afecta a M2.
- DNI, NSS, dirección fiscal: pendiente pre-producción real (project memory).

## 6. Integraciones externas

### 6.1 Resend (emails transaccionales)

- **Cuenta**: free tier (3.000 emails/mes, 100/día).
- **Dominio**: shared de Resend (`onboarding@resend.dev` o el que asigne Resend al verificar la cuenta) para M2. Dominio propio en pre-producción real.
- **Templates HTML** en `supabase/functions/_shared/email-templates/`:
  - `worker-verification.html` — link de verificación.
  - `worker-approved.html` — bienvenida al trabajador aprobado.
  - `event-confirmation.html` — resumen del evento + QR inline + (PDF adjunto se añade en código).
- **Secret**: `RESEND_API_KEY` se configura con `npx supabase secrets set` para que las Edge Functions accedan.

### 6.2 QR

- **Client-side** (`qrcode.react`): visible en pantalla de detalle del evento, regenerado en cada render desde `event.access_token`.
- **Server-side** (Deno `qrcode` lib): generado en `send-event-confirmation` como PNG base64 para embebido inline en HTML y para el PDF.
- URL codificada: `https://<dominio>/e/<access_token>`. Determinista (mismo token → mismo QR).

### 6.3 PDF

- **Librería**: `pdf-lib` en Deno.
- **Formato**: A4 portrait, una página.
- **Contenido**: header empresa, datos del evento (nombre, dirección, fecha, organizador), lista de trabajadores con sus horarios, QR grande, URL en texto debajo del QR, mensaje "pega este papel a la vista de los trabajadores al inicio del evento".
- **MIME** del adjunto: `application/pdf`, filename `confirmacion-<event_name_slugified>.pdf`.

## 7. Testing

### 7.1 Frontend (Vitest + RTL)

Tests nuevos:
- `signup.test.tsx` (actualizar) — mockea fetch a `/functions/v1/signup-admin`.
- `agenda.test.tsx` — render listado, switch entre pestañas, toggle archivados.
- `worker-form.test.tsx` — validación de campos, honeypot, transición post-submit.
- `worker-verification.test.tsx` — render del mensaje final con nombre de empresa.
- `cliente-form.test.tsx` — CRUD cliente, validación.
- `evento-form.test.tsx` — validación, bulk schedule, duplicar fila, asignación.
- `evento-detalle.test.tsx` — render QR, botón "Enviar confirmación" con sello previo.

### 7.2 Edge Functions (Deno test)

Nuevo en M2. Tests con mocks de Supabase client y Resend:
- `signup-admin.test.ts` — flujo feliz + rollback al fallar INSERT post createUser.
- `request-worker-registration.test.ts` — JWT bien firmado, email enviado, rate limit, honeypot.
- `verify-worker-registration.test.ts` — INSERT idempotente, JWT caducado rechazado, JWT inválido rechazado.
- `send-event-confirmation.test.ts` — PDF generado con contenido correcto, Resend llamado con adjunto.

### 7.3 pgTAP (Postgres)

Tests nuevos (suman a los 4 actuales):
- `rls_tenant_isolation.sql` (ampliar existente) — aislamiento RLS también en `workers`, `clients`, `events`, `event_assignments`.
- `signup_atomic.sql` (Issue 6) — el flujo signup crea las dos rows atómicamente; rollback funciona.
- `jwt_claim_company_id.sql` — el Auth Hook inyecta `company_id`; las políticas RLS nuevas funcionan con el claim.
- `unique_email_partial_index.sql` — UNIQUE permite re-registro tras archivar, bloquea tras rechazar.
- `event_assignments_split_shift.sql` — dos asignaciones del mismo worker en el mismo evento son válidas.
- `audit_trigger.sql` — INSERT/UPDATE/DELETE en workers/clients/events/event_assignments dispara fila en audit_log con company_id, action, entity_id y diff correctos; actor_id es null cuando la mutación viene de service_role.

### 7.4 E2E manual (pre tag `v0.2.0-m2`)

Checklist humano contra producción tras el merge a `main`:

1. Signup admin nuevo → company creada.
2. Candidato registra → recibe email → click → ficha pending creada (verificar en Table Editor).
3. Admin aprueba candidato → trabajador recibe email de bienvenida.
4. Admin crea cliente.
5. Admin crea evento, asigna 3 trabajadores con horario partido (uno duplicado), usa bulk-set para cambiar horarios.
6. Admin abre el evento, ve el QR, click "Enviar confirmación".
7. Organizador (= email del admin para test) recibe email con QR inline + PDF adjunto.
8. Re-envío: pulsar otra vez → confirm dialog → segundo envío con sello "última vez hace X".
9. Archivar un worker y comprobar que desaparece del listado por defecto + se puede reactivar con toggle.

## 8. Estructura del repositorio tras M2

```
checkin-app/
├── src/
│   ├── lib/
│   │   ├── env.ts
│   │   ├── supabase.ts
│   │   └── api/                              ← NEW
│   │       ├── signup-admin.ts
│   │       ├── worker-registration.ts
│   │       └── send-event-confirmation.ts
│   ├── auth/                                  (existente; race fix en AuthProvider)
│   ├── components/                            ← NEW
│   │   ├── DataTable.tsx
│   │   ├── SearchInput.tsx
│   │   ├── ConfirmDialog.tsx
│   │   ├── EmptyState.tsx
│   │   ├── StatusBadge.tsx
│   │   └── ArchivedToggle.tsx
│   ├── features/                              ← NEW (organización por feature)
│   │   ├── agenda/
│   │   │   ├── AgendaList.tsx
│   │   │   ├── WorkerDetail.tsx
│   │   │   ├── WorkerActions.tsx
│   │   │   └── api.ts
│   │   ├── clientes/
│   │   │   ├── ClientesList.tsx
│   │   │   ├── ClienteForm.tsx
│   │   │   └── api.ts
│   │   └── eventos/
│   │       ├── EventosList.tsx
│   │       ├── EventoForm.tsx
│   │       ├── EventoDetalle.tsx
│   │       ├── AsignacionesTable.tsx
│   │       └── api.ts
│   ├── routes/
│   │   ├── signup.tsx                         (refactor)
│   │   ├── login.tsx                          (sin cambios)
│   │   ├── candidato/                         ← NEW
│   │   │   ├── registro.tsx
│   │   │   ├── registro-enviado.tsx
│   │   │   ├── verificar.tsx
│   │   │   └── gracias.tsx
│   │   └── admin/
│   │       ├── layout.tsx
│   │       ├── home.tsx
│   │       ├── agenda.tsx                     → AgendaList
│   │       ├── agenda/[worker_id].tsx          ← NEW
│   │       ├── clientes.tsx                   → ClientesList
│   │       ├── eventos.tsx                    → EventosList
│   │       ├── eventos/[id].tsx                ← NEW (detalle)
│   │       ├── eventos/nuevo.tsx               ← NEW (form)
│   │       ├── reportes.tsx                    (sigue placeholder)
│   │       └── auditoria.tsx                   (sigue placeholder)
│   └── types/
│       └── database.ts                        (regenerado tras migraciones)
├── supabase/
│   ├── migrations/                            (~6 nuevas en M2)
│   │   ├── <ts>_jwt_claim_hook.sql
│   │   ├── <ts>_migrate_rls_to_jwt_claim.sql
│   │   ├── <ts>_workers.sql
│   │   ├── <ts>_clients.sql
│   │   ├── <ts>_events.sql
│   │   └── <ts>_event_assignments.sql
│   ├── functions/
│   │   ├── _shared/
│   │   │   ├── resend.ts
│   │   │   ├── jwt.ts
│   │   │   ├── pdf.ts
│   │   │   ├── rate-limit.ts
│   │   │   └── email-templates/
│   │   │       ├── worker-verification.html
│   │   │       ├── worker-approved.html
│   │   │       └── event-confirmation.html
│   │   ├── signup-admin/
│   │   ├── company-by-slug/
│   │   ├── request-worker-registration/
│   │   ├── verify-worker-registration/
│   │   ├── approve-worker/
│   │   └── send-event-confirmation/
│   ├── tests/                                 (los 4 actuales + 5 nuevos)
│   └── config.toml                            (registra el Auth Hook)
└── docs/
    └── superpowers/
        └── specs/
            ├── 2026-05-16-checkin-app-design.md
            └── 2026-05-17-m2-agenda-eventos-design.md ← este documento
```

## 9. Criterios de aceptación M2

- [ ] Fase 0 completa: Auth Hook activo, todas las políticas RLS migradas, signup-admin Edge Function atómica, AuthProvider sin race.
- [ ] Test pgTAP del signup atómico pasa.
- [ ] Candidato puede auto-registrarse, recibe email de verificación, al confirmar queda como pending.
- [ ] Admin ve pestañas Aprobados / Pendientes con contadores en tiempo real.
- [ ] Admin aprueba → trabajador recibe email de bienvenida.
- [ ] Admin rechaza → silencio (sin email).
- [ ] Admin gestiona clientes con buscador.
- [ ] Admin crea evento single-page con asignación de workers, bulk-edit de horarios, duplicar para horario partido.
- [ ] QR client-side se muestra correctamente en el detalle del evento.
- [ ] Botón "Enviar confirmación" envía email al organizador con QR inline + PDF adjunto.
- [ ] Reenvío funciona con confirm dialog y sello de "última vez".
- [ ] Soft delete: workers, clients, events se archivan (no se borran) y aparecen con toggle "Mostrar archivados".
- [ ] Audit log se rellena en TODAS las mutaciones admin.
- [ ] Tests: frontend (Vitest) + Edge Functions (Deno) + pgTAP, todos verdes.
- [ ] E2E manual completo, verificado contra producción.
- [ ] Tag `v0.2.0-m2` sobre el merge a `main`.
