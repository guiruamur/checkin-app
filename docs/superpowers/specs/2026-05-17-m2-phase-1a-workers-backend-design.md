# M2 Fase 1a — Workers backend: Diseño

**Fecha**: 2026-05-17
**Estado**: Spec aprobado, pendiente de plan de implementación
**Predecesores**:
- `2026-05-16-checkin-app-design.md` (spec maestro)
- `2026-05-17-m2-agenda-eventos-design.md` (spec M2 global)
- `2026-05-17-m2-phase-0-prereqs.md` (plan Fase 0, ya ejecutado)

## 1. Contexto y objetivo

Esta fase entrega **toda la lógica server-side del registro de candidato y la gestión de agenda**, sin tocar UI. Tras Fase 1a:

- El schema `workers` está en cloud, auditado por el trigger genérico ya existente.
- 4 Edge Functions cubren el flujo público (registro double opt-in) y la acción de aprobación con email.
- Resend está integrado con resolver de remitente per-tenant (white-label) que cae a un dominio compartido cuando no hay configuración por tenant.
- Las 3 columnas de white-label están en `companies` (vacías por defecto, listas para cuando llegue UI de configuración en M3+).
- Tests automatizados: pgTAP para aislamiento RLS y triggers, Deno tests con mocks para las 4 Edge Functions.

Fase 1b (separada) implementará las UIs que conectan con estas funciones: formulario público de candidato, pantalla de verificación, pantalla de gracias, panel admin `/admin/agenda` con pestañas y ficha de worker. Sin Fase 1a, esas UIs no tendrían backend al que llamar.

### Por qué dividir 1a y 1b

- 1a es testeable extremo-a-extremo con `curl` y tests automáticos. No depende del diseño visual (Stitch llegará después de tener app funcional).
- 1b puede aplicar el diseño Stitch directamente sobre componentes nuevos sin rebobinar lógica server-side.
- Cada fase es un PR digerible (~10-15 tareas) en vez de uno monolítico de 25+.

### Decisiones cerradas en brainstorm

- **Decomposición**: 1a backend + 1b frontend (cierra el ciclo de candidato cuando ambas estén en main).
- **Resend**: cuenta gratis con dominio compartido `notify.ruanodev.com` para M2. Schema white-label preparado.
- **Subdominio**: `notify.ruanodev.com` (no la raíz) para aislar reputación.
- **Rate limiting**: deferido. Solo honeypot para spam de bots en M2.
- **JWT TTL** del token de verificación email: 24 horas.
- **Honeypot field**: `website` (input oculto con CSS).
- **Sender local-part**: `noreply@notify.ruanodev.com`.
- **Aprobar**: Edge Function con efecto email. **Rechazar/archivar**: UPDATE directo desde SPA (trigger audita).

### Fuera de alcance (deferido)

- Toda UI (Fase 1b).
- Rate limiting de Edge Functions públicas (cuando aparezca abuso real).
- UI de configuración del white-label sender (M3+).
- Verificación de email del admin en signup (project memory `project_pending_email_verification.md`).

## 2. Modelo de datos

### Cambios en `companies` (white-label sender)

```sql
alter table public.companies
  add column email_sender_domain text,
  add column email_sender_address text,
  add column email_sender_verified_at timestamptz;

comment on column public.companies.email_sender_domain is
  'Dominio verificado en Resend para envío desde este tenant. NULL = usa el shared (notify.ruanodev.com).';
comment on column public.companies.email_sender_address is
  'Dirección remitente completa (ej. noreply@cliente.com). NULL = usa noreply@notify.ruanodev.com.';
comment on column public.companies.email_sender_verified_at is
  'Cuándo Resend confirmó la verificación DNS. NULL = no verificado; se rellena cuando la UI o el dueño manualmente confirme.';
```

Las tres columnas son nullable. Todos los registros existentes y futuros quedan con NULL → todos usan el sender compartido. La UI de configuración (M3+) las poblará por tenant.

### Tabla nueva `workers`

```sql
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
```

### Notas

- `experience_summary` sin CHECK de longitud SQL. La validación de ≤500 chars vive en la Zod schema del Edge Function. Cambio futuro = solo Zod, sin migración.
- `languages text[]` sin enum constraint. Validación de valores permitidos vive en la Zod schema.
- UNIQUE parcial `WHERE archived_at IS NULL`: re-registro permitido tras archivar; bloqueado en estados pending/approved/rejected.
- Trigger `log_audit_event` pegado en esta misma migración. Toda mutación queda auditada desde el día 1.

## 3. Edge Functions (4 nuevas)

Todas viven en `supabase/functions/<nombre>/index.ts` y siguen el patrón establecido en Fase 0:
- Handler exportado como `default async function`.
- `Deno.serve(handler)` envuelto en `if (import.meta.main)` para testabilidad.
- Headers CORS desde `_shared/cors.ts`.
- Validación de body con Zod.
- Cliente admin de Supabase creado dentro del handler con `service_role`.

### 3.1 `company-by-slug` (público, GET)

**Propósito**: que el SPA público pueda mostrar el nombre de la empresa al abrir el formulario de candidato.

**Endpoint**: `GET /functions/v1/company-by-slug?slug=<slug>`

**Lógica**:
1. Si falta `slug` query param → 400 `{ error: "missing_slug" }`.
2. SELECT `name` FROM companies WHERE slug = `<slug>` (limitado a 1).
3. Si no encontrado → 404 `{ error: "not_found" }`.
4. 200 `{ name: company.name }`.

**Verify JWT**: NO (`verify_jwt = false` en `config.toml`).

**Sin leakage**: solo expone `name`. Ni IDs internos ni emails.

### 3.2 `request-worker-registration` (público, POST)

**Propósito**: validar datos del formulario, generar JWT de verificación, mandar email al candidato.

**Endpoint**: `POST /functions/v1/request-worker-registration`

**Body schema (Zod)**:
```ts
{
  company_slug: z.string().min(1),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().regex(/^\+?[0-9]{9,15}$/),
  postal_code: z.string().regex(/^\d{5}$/).optional(),
  languages: z.array(z.enum([
    "español", "catalán", "inglés", "francés", "alemán", "italiano",
    "portugués", "gallego", "euskera", "árabe", "chino", "ruso", "otros"
  ])).max(8),
  experience_summary: z.string().max(500).optional(),
  website: z.string().length(0)  // honeypot: TIENE que estar vacío
}
```

**Lógica**:
1. Parsear body. Si Zod falla → 400 `{ error: "validation", details }`.
2. **Honeypot**: si `website` no es string vacío → 200 vacío sin hacer nada (silenciamos bots, no les damos pista).
3. Resolver `company_id` desde `company_slug`. Si no existe → 404 `{ error: "company_not_found" }`.
4. Generar JWT HS256 firmado con `Deno.env.get("SUPABASE_JWT_SECRET")`. Payload:
   ```ts
   { form_data, company_id, exp: now + 86400 }  // 24h
   ```
5. Construir URL: `${SITE_URL}/candidato/verificar?token=${jwt}`. `SITE_URL` viene de env var, configurable por entorno.
6. Resolver sender via helper `_shared/resend.ts`.
7. Renderizar template `worker-verification.html` con `{{company_name}}` y `{{verify_url}}`.
8. Enviar email via Resend. Si falla → 500 `{ error: "email_send_failed" }`.
9. 200 vacío (sin revelar si el email ya existe en BD).

**Verify JWT**: NO.

### 3.3 `verify-worker-registration` (público, POST)

**Propósito**: completar el double opt-in. Validar el token del email y crear la fila `workers` si no existe.

**Endpoint**: `POST /functions/v1/verify-worker-registration`

**Body schema (Zod)**: `{ token: z.string() }`.

**Lógica**:
1. Parsear body.
2. Verificar JWT con `SUPABASE_JWT_SECRET`:
   - Firma inválida → 400 `{ error: "invalid_token" }`.
   - Expirado → 400 `{ error: "token_expired" }`.
3. Extraer `form_data` y `company_id` del payload.
4. Resolver `company.name` para incluirlo en la respuesta.
5. Buscar worker existente: `SELECT 1 FROM workers WHERE company_id = X AND lower(email) = lower(Y) AND archived_at IS NULL`.
6. Si existe → idempotente, NO INSERT, NO error.
7. Si NO existe → INSERT con `status='pending'` + los datos del formulario. El trigger `log_audit_event` audita automáticamente.
8. 200 `{ company_name }`.

**Verify JWT**: NO (validamos nuestro propio JWT manualmente con la lib `https://deno.land/x/djwt`).

### 3.4 `approve-worker` (admin, POST)

**Propósito**: cambiar status a `approved`, mandar email de bienvenida al trabajador.

**Endpoint**: `POST /functions/v1/approve-worker`

**Body schema (Zod)**: `{ worker_id: z.string().uuid() }`.

**Lógica**:
1. Validar JWT del admin (Supabase auto-valida `verify_jwt = true`).
2. Extraer `company_id` del claim del admin.
3. SELECT del worker: `SELECT id, email, first_name, status FROM workers WHERE id = $1`. RLS filtra por tenant. Si no encontrado → 403 `{ error: "not_found_or_forbidden" }`.
4. Si `status !== 'pending'` → 409 `{ error: "not_pending" }`.
5. UPDATE: `status='approved', approved_at=now(), approved_by=auth.uid()`. El trigger audita.
6. Resolver sender + nombre de empresa para el email.
7. Renderizar `worker-approved.html` con `{{company_name}}` y `{{worker_first_name}}`.
8. Enviar email vía Resend. Si falla → log del error + 200 `{ ok: true, email_warning: true }` (la aprobación ya está hecha; el email es secundario, no debe bloquear la respuesta).
9. Si todo OK → 200 `{ ok: true }`.

**Verify JWT**: SÍ.

## 4. Helpers compartidos (`supabase/functions/_shared/`)

### `resend.ts`

Centraliza:
- Resolver de sender: lee `email_sender_address` y `email_sender_verified_at` de la company. Si `verified_at IS NULL` → fallback a `noreply@notify.ruanodev.com`.
- Llamada HTTP a `https://api.resend.com/emails`.
- Modo mock: si `Deno.env.get("RESEND_API_KEY")` es undefined, en vez de llamar a Resend hace `console.log` del email completo. Permite desarrollo local sin credenciales y sin contaminar el quota de Resend.

API exportada:
```ts
export async function sendEmail({
  companyId: string,
  to: string,
  subject: string,
  html: string,
}): Promise<{ id?: string; mocked?: boolean }>
```

Si Resend devuelve 4xx/5xx, lanza `Error` con el mensaje.

### `jwt.ts`

Centraliza firma y verificación de JWT custom (para el token del email de verificación). NO confundir con los JWT de Supabase Auth.

Usa `https://deno.land/x/djwt@v3.0.2/mod.ts` (librería estándar Deno para JWT).

API exportada:
```ts
export async function signVerificationToken(payload: object, ttlSeconds: number): Promise<string>
export async function verifyVerificationToken<T>(token: string): Promise<T>
```

`signVerificationToken` añade `exp` automáticamente desde `ttlSeconds`. `verifyVerificationToken` lanza si firma o exp no válidos.

Secret: `Deno.env.get("SUPABASE_JWT_SECRET")` (Supabase la inyecta automáticamente en runtime de Edge Functions).

### `email-templates/`

Dos archivos HTML estáticos, mobile-friendly, estilos inline (compatibilidad con Gmail/Outlook):
- `worker-verification.html` — placeholders `{{company_name}}`, `{{verify_url}}`.
- `worker-approved.html` — placeholders `{{company_name}}`, `{{worker_first_name}}`.

Sustitución simple en el helper: `template.replace(/{{(\w+)}}/g, (_, k) => vars[k] ?? "")`. Sin librería de templating.

## 5. Configuración de Resend (operativo, fuera de código)

Estos pasos son manuales del usuario (Germán), no automatizables desde el código:

1. **Crear cuenta** en https://resend.com (gratis, sin tarjeta).
2. **Generar API key** en el dashboard.
3. **Añadir dominio `notify.ruanodev.com`** en el dashboard de Resend. Resend genera 3 registros DNS (1 SPF, 1 DKIM, 1 DMARC).
4. **Añadir los 3 registros DNS** en el proveedor donde vive el DNS de `ruanodev.com` (NO en Squarespace según vimos — está delegado a otro provider). Esperar verificación (~minutos a ~24h).
5. **Setear secret en Supabase cloud**: `npx supabase secrets set RESEND_API_KEY=re_xxx`.

Hasta que (5) esté hecho, las Edge Functions en cloud no envían emails reales (devolverán error 500 al intentar) pero el resto del flujo (validación, JWT) funciona.

En local dev, sin `RESEND_API_KEY`, el helper hace mock con `console.log`. Permite desarrollo completo sin cuenta Resend.

## 6. Tests

### pgTAP (3 archivos nuevos)

- **`workers_rls.sql`** — Admin A no ve workers de Empresa B (cross-tenant isolation). Setup: 2 companies + 2 workers (uno por company). Impersonar Admin A con JWT claim `company_id` y SELECT count → debe ser 1.
- **`workers_audit_attached.sql`** — INSERT/UPDATE/DELETE en `workers` dispara entradas en `audit_log` con `action='workers.<op>'` y diff correcto.
- **`workers_unique_email_partial.sql`** — Insert worker email X → OK. Insert otro con mismo email + mismo company_id → falla con unique_violation. Archivar el primero. Insert otro con mismo email → OK (porque el UNIQUE parcial solo aplica a no-archivados).

### Deno (4 archivos, uno por Edge Function)

Cada uno con mock de admin client + mock de fetch (para Resend).

**`company-by-slug.test.ts`**:
- 200 con `{ name }` cuando slug existe.
- 404 cuando slug no existe.
- 400 cuando falta query param.

**`request-worker-registration.test.ts`**:
- 200 cuando body válido + email enviado (verifica que `sendEmail` se llamó).
- 200 silencioso cuando honeypot relleno (verifica que `sendEmail` NO se llamó).
- 400 con `validation` cuando email inválido.
- 404 cuando slug no existe.
- JWT generado contiene los datos del formulario y exp ~24h.

**`verify-worker-registration.test.ts`**:
- 200 con `{ company_name }` y worker insertado cuando token válido.
- 400 `token_expired` cuando exp pasado.
- 400 `invalid_token` cuando firma rota.
- 200 idempotente cuando worker ya existe (sin INSERT duplicado).

**`approve-worker.test.ts`**:
- 200 con `{ ok }` + email enviado cuando worker existe y está pending.
- 409 `not_pending` cuando worker ya está approved.
- 403 cuando worker pertenece a otro tenant (RLS bloquea SELECT).
- 207 `{ ok, email_warning }` cuando UPDATE OK pero email falla.

## 7. Estructura del repositorio tras Fase 1a

Adiciones (⬇️) y existentes:

```
supabase/
├── migrations/
│   └── <ts>_workers_and_company_email_sender.sql                ⬇️
├── functions/
│   ├── _shared/
│   │   ├── cors.ts                                              (existente)
│   │   ├── resend.ts                                            ⬇️
│   │   ├── jwt.ts                                               ⬇️
│   │   └── email-templates/
│   │       ├── worker-verification.html                         ⬇️
│   │       └── worker-approved.html                             ⬇️
│   ├── signup-admin/                                            (existente, sin cambios)
│   ├── company-by-slug/                                         ⬇️
│   │   ├── index.ts
│   │   └── index.test.ts
│   ├── request-worker-registration/                             ⬇️
│   │   ├── index.ts
│   │   └── index.test.ts
│   ├── verify-worker-registration/                              ⬇️
│   │   ├── index.ts
│   │   └── index.test.ts
│   └── approve-worker/                                          ⬇️
│       ├── index.ts
│       └── index.test.ts
└── tests/
    ├── (todos los actuales)
    ├── workers_rls.sql                                          ⬇️
    ├── workers_audit_attached.sql                               ⬇️
    └── workers_unique_email_partial.sql                         ⬇️
```

Sin cambios en `src/` (frontend). Sin cambios en `wrangler.jsonc`, `package.json`, etc. — toda la fase es server-side.

## 8. Setup manual cloud post-merge

Cuando Fase 1a se mergea a `main`:

```bash
# 1. Migración de schema (workers + companies columns)
npx supabase db push

# 2. Deploy de cada Edge Function nueva
npx supabase functions deploy company-by-slug --no-verify-jwt
npx supabase functions deploy request-worker-registration --no-verify-jwt
npx supabase functions deploy verify-worker-registration --no-verify-jwt
npx supabase functions deploy approve-worker
# (approve-worker SÍ verify-jwt porque es admin-only)

# 3. Setear env vars en cloud
npx supabase secrets set SITE_URL=https://checkin-app.guiruamur.workers.dev
# (Cuando esté lista la cuenta Resend)
npx supabase secrets set RESEND_API_KEY=re_xxx
```

Para preview de develop, ajustar `SITE_URL` al alias del preview cuando se quiera probar el flujo end-to-end allí.

Sin estos pasos, el código está en cloud pero las funciones no responden / no mandan emails.

## 9. Criterios de aceptación

- [ ] Migración aplica limpia en local + cloud sin errores.
- [ ] `workers` tabla existe en cloud con RLS, trigger audit, índices y UNIQUE parcial.
- [ ] `companies` tiene las 3 columnas nuevas, nullable.
- [ ] Las 4 Edge Functions deployadas en cloud y responden correctamente a `curl`.
- [ ] Flujo end-to-end mediante curl funciona:
  - `company-by-slug?slug=mi-empresa` → 200 con nombre
  - `request-worker-registration` con datos válidos → 200, email enviado (o mockeado si no hay Resend)
  - JWT del email decodificable, `verify-worker-registration` con ese token → 200, worker creado en BD
  - `approve-worker` con worker_id válido → 200, status actualizado, email enviado
- [ ] Tests automatizados: pgTAP (3 nuevos) + Deno (~15 nuevos) todos verdes.
- [ ] Audit log se rellena automáticamente para cada mutación en `workers`.
- [ ] Tag `v0.3.0-m2-phase1a` sobre el merge a main.
