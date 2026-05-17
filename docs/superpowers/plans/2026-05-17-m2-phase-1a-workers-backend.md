# M2 Fase 1a — Workers Backend: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el server-side completo del registro de candidato con double opt-in: tabla `workers` con audit trigger, 3 columnas white-label en `companies`, 4 Edge Functions (`company-by-slug`, `request-worker-registration`, `verify-worker-registration`, `approve-worker`), helpers compartidos Resend+JWT, 2 templates de email y cobertura de tests pgTAP + Deno.

**Architecture:** Edge Functions Deno en Supabase. Cliente admin con `service_role` para bypass RLS. JWT custom firmado con `SUPABASE_JWT_SECRET` para token de verificación email (TTL 24h). Resend helper con resolver de sender per-tenant (fallback a `noreply@notify.ruanodev.com` cuando no hay verificación per-tenant). Templates HTML embebidos en módulo TS para evitar file I/O en runtime. Tests Deno con mock del cliente admin.

**Tech Stack:** Supabase (Postgres + Edge Functions Deno), TypeScript, djwt para JWT custom, Zod para validación, pgTAP para tests SQL, Deno test para Edge Functions. Resend HTTP API.

**Spec de referencia:** `docs/superpowers/specs/2026-05-17-m2-phase-1a-workers-backend-design.md`

**Branch:** trabajo en `feat/m2-phase-1a-workers-backend` desde `develop`. PR contra `develop` al terminar. PR develop → main tras smoke local.

---

## Deviation notice: templates en TS, no HTML

El spec describe `_shared/email-templates/worker-verification.html` y `worker-approved.html` como ficheros HTML estáticos. El plan los implementa como **un único módulo TS** (`_shared/email-templates.ts`) con dos exports de tipo string. Razones:

- Evita la complejidad de cargar ficheros en runtime con `Deno.readTextFile` y resolver paths con `import.meta.url` dentro del runtime de Edge Functions (puede comportarse distinto entre local y cloud).
- Hace los templates parte del bundle de cada función que los importa — cero file I/O en producción, build determinista.
- La sintaxis de template literal (\`\`) permite el HTML multilínea con la misma legibilidad que un fichero `.html`.
- Si en el futuro el diseño Stitch produce HTML, copiar+pegar dentro del template literal es trivial.

---

## File Structure (Fase 1a)

```
checkin-app/
├── supabase/
│   ├── migrations/
│   │   └── <ts>_workers_and_company_email_sender.sql      ⬇️
│   ├── functions/
│   │   ├── _shared/
│   │   │   ├── cors.ts                                     (existente)
│   │   │   ├── jwt.ts                                      ⬇️
│   │   │   ├── jwt.test.ts                                 ⬇️
│   │   │   ├── resend.ts                                   ⬇️
│   │   │   ├── resend.test.ts                              ⬇️
│   │   │   └── email-templates.ts                          ⬇️ (TS, no .html)
│   │   ├── signup-admin/                                   (existente)
│   │   ├── company-by-slug/                                ⬇️
│   │   │   ├── index.ts
│   │   │   └── index.test.ts
│   │   ├── request-worker-registration/                    ⬇️
│   │   │   ├── index.ts
│   │   │   └── index.test.ts
│   │   ├── verify-worker-registration/                     ⬇️
│   │   │   ├── index.ts
│   │   │   └── index.test.ts
│   │   └── approve-worker/                                 ⬇️
│   │       ├── index.ts
│   │       └── index.test.ts
│   ├── config.toml                                          modificado (registra 4 functions)
│   └── tests/
│       ├── (existentes)
│       ├── workers_rls.sql                                  ⬇️
│       ├── workers_audit_attached.sql                       ⬇️
│       └── workers_unique_email_partial.sql                 ⬇️
└── README.md                                                modificado (cloud setup nuevas functions)
```

---

## Phase 0 — Branch setup

### Task 1: Crear branch de trabajo

**Files:** ninguno (operación git)

- [ ] **Step 1: Sincronizar develop**

```bash
git checkout develop
git pull origin develop
```

Esperado: develop al día con el merge de PR #9 (spec de Fase 1a).

- [ ] **Step 2: Crear branch**

```bash
git checkout -b feat/m2-phase-1a-workers-backend
git status
```

Esperado: `On branch feat/m2-phase-1a-workers-backend`. Working tree clean.

- [ ] **Step 3: Verificar Supabase local activo**

```bash
docker ps | grep supabase
npx supabase status
```

Si Docker no está corriendo, arrancarlo. Si `supabase status` falla, `npx supabase start`.

---

## Phase 1 — Database schema

### Task 2: Migración — `workers` table + `companies` white-label columns + audit trigger attach

**Files:**
- Create: `supabase/migrations/<ts>_workers_and_company_email_sender.sql`

- [ ] **Step 1: Generar migración**

```bash
npx supabase migration new workers_and_company_email_sender
```

Esperado: crea `supabase/migrations/<timestamp>_workers_and_company_email_sender.sql`.

- [ ] **Step 2: Poblar la migración**

Contenido EXACTO:

```sql
-- Fase 1a: tabla workers + columnas white-label sender en companies + trigger audit.
--
-- workers: agenda de candidatos por tenant. Aprobación gestionada por admin.
-- companies: 3 columnas nullable para white-label sender (vacías por defecto,
--   fallback a noreply@notify.ruanodev.com en el helper de Resend).
-- audit: el trigger log_audit_event (Fase 0) se adjunta a workers para
--   registrar toda mutación.

-- 1. White-label sender columns on companies
alter table public.companies
  add column email_sender_domain text,
  add column email_sender_address text,
  add column email_sender_verified_at timestamptz;

comment on column public.companies.email_sender_domain is
  'Dominio verificado en Resend para envío desde este tenant. NULL = usa el shared (notify.ruanodev.com).';
comment on column public.companies.email_sender_address is
  'Dirección remitente completa (ej. noreply@cliente.com). NULL = usa noreply@notify.ruanodev.com.';
comment on column public.companies.email_sender_verified_at is
  'Cuándo Resend confirmó la verificación DNS. NULL = no verificado; se rellena cuando admin lo configure.';

-- 2. workers table
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

-- UNIQUE parcial: permite re-registro tras archivar, bloquea email duplicado en estados activos.
create unique index workers_company_email_unique
  on public.workers (company_id, lower(email))
  where archived_at is null;

create index workers_company_status_idx
  on public.workers (company_id, status);

alter table public.workers enable row level security;

create policy workers_tenant on public.workers
  for all to authenticated
  using (company_id = (auth.jwt() ->> 'company_id')::uuid);

-- 3. Attach generic audit trigger
create trigger workers_audit
  after insert or update or delete on public.workers
  for each row execute function public.log_audit_event();
```

- [ ] **Step 3: Aplicar migración**

```bash
npx supabase db reset
```

Esperado: aplica todas las migraciones limpias.

- [ ] **Step 4: Verificar schema**

```bash
docker exec supabase_db_checkin-app psql -U postgres -c "\d public.workers"
docker exec supabase_db_checkin-app psql -U postgres -c "select column_name from information_schema.columns where table_schema='public' and table_name='companies' and column_name like 'email_sender%';"
docker exec supabase_db_checkin-app psql -U postgres -c "select tgname from pg_trigger where tgrelid = 'public.workers'::regclass;"
```

Esperado:
- `workers` con todas las columnas + RLS habilitado + 2 índices visibles.
- 3 columnas `email_sender_*` en `companies`.
- Trigger `workers_audit` presente.

- [ ] **Step 5: Commit (SIN trailer Co-Authored-By)**

```bash
git add supabase/migrations/
git commit -m "feat(db): add workers table, white-label sender columns, audit trigger attach"
```

---

## Phase 2 — pgTAP tests for the schema

### Task 3: pgTAP — workers RLS cross-tenant isolation

**Files:**
- Create: `supabase/tests/workers_rls.sql`

- [ ] **Step 1: Escribir test**

Crear `supabase/tests/workers_rls.sql` con contenido EXACTO:

```sql
-- Verifica que un admin de Empresa A NO ve workers de Empresa B.
-- Crítico para multi-tenant: si esta regla se rompe, leak entre empresas cliente.

begin;
select plan(2);

-- Setup: 2 companies + 2 admin_users + 2 workers (uno por company)
insert into auth.users (id, email, encrypted_password, email_confirmed_at) values
  ('11111111-1111-1111-1111-111111111111', 'admina@a.com', '', now()),
  ('22222222-2222-2222-2222-222222222222', 'adminb@b.com', '', now());

insert into public.companies (id, name, slug) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Empresa A', 'empresa-a'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Empresa B', 'empresa-b');

insert into public.admin_users (id, company_id, email, full_name) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admina@a.com', 'Admin A'),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'adminb@b.com', 'Admin B');

insert into public.workers (company_id, email, phone, first_name, last_name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'worker_a@x.com', '600000001', 'WA', 'Test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'worker_b@x.com', '600000002', 'WB', 'Test');

-- Impersonar Admin A (JWT con company_id de Empresa A)
set local role authenticated;
set local "request.jwt.claims" to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","company_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';

-- Test 1: Admin A solo ve SU worker
select results_eq(
  $$ select count(*)::int from public.workers $$,
  $$ values (1) $$,
  'admin A only sees own company workers'
);

-- Test 2: Admin A no puede SELECT específico de worker B
select results_eq(
  $$ select count(*)::int from public.workers where email = 'worker_b@x.com' $$,
  $$ values (0) $$,
  'admin A cannot see admin B specific worker by email lookup'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Ejecutar tests**

```bash
npx supabase test db
```

Esperado: tests anteriores + 2 nuevos. TODOS PASS.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/workers_rls.sql
git commit -m "test(db): workers RLS isolates rows per tenant"
```

---

### Task 4: pgTAP — workers audit trigger attached

**Files:**
- Create: `supabase/tests/workers_audit_attached.sql`

- [ ] **Step 1: Escribir test**

```sql
-- Verifica que el trigger log_audit_event está pegado a workers y genera
-- entradas en audit_log con action correcto y diff coherente.

begin;
select plan(4);

-- Setup
insert into auth.users (id, email, encrypted_password, email_confirmed_at) values
  ('33333333-3333-3333-3333-333333333333', 'audit@a.com', '', now());

insert into public.companies (id, name, slug) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Audit Co', 'audit-co');

insert into public.admin_users (id, company_id, email, full_name) values
  ('33333333-3333-3333-3333-333333333333', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'audit@a.com', 'Audit');

-- INSERT
insert into public.workers (id, company_id, email, phone, first_name, last_name)
values ('44444444-4444-4444-4444-444444444444',
        'cccccccc-cccc-cccc-cccc-cccccccccccc',
        'wt@x.com', '600000003', 'WT', 'Test');

select results_eq(
  $$ select action from public.audit_log
     where entity_id = '44444444-4444-4444-4444-444444444444'
       and action like 'workers.%'
     order by created_at $$,
  $$ values ('workers.insert'::text) $$,
  'INSERT on workers produces workers.insert audit row'
);

select ok(
  exists(
    select 1 from public.audit_log
    where entity_id = '44444444-4444-4444-4444-444444444444'
      and action = 'workers.insert'
      and diff -> 'after' ->> 'email' = 'wt@x.com'
  ),
  'INSERT audit diff captures inserted email'
);

-- UPDATE (cambio de estado)
update public.workers set status = 'approved' where id = '44444444-4444-4444-4444-444444444444';

select ok(
  exists(
    select 1 from public.audit_log
    where entity_id = '44444444-4444-4444-4444-444444444444'
      and action = 'workers.update'
      and diff -> 'before' ->> 'status' = 'pending'
      and diff -> 'after' ->> 'status' = 'approved'
  ),
  'UPDATE audit diff captures status change'
);

-- DELETE
delete from public.workers where id = '44444444-4444-4444-4444-444444444444';

select ok(
  exists(
    select 1 from public.audit_log
    where entity_id = '44444444-4444-4444-4444-444444444444'
      and action = 'workers.delete'
  ),
  'DELETE on workers produces workers.delete audit row'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Ejecutar tests**

```bash
npx supabase test db
```

Esperado: TODOS PASS (anteriores + 4 nuevos).

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/workers_audit_attached.sql
git commit -m "test(db): workers audit trigger captures insert/update/delete with diff"
```

---

### Task 5: pgTAP — workers UNIQUE email partial index

**Files:**
- Create: `supabase/tests/workers_unique_email_partial.sql`

- [ ] **Step 1: Escribir test**

```sql
-- Verifica que el UNIQUE(company_id, lower(email)) WHERE archived_at IS NULL
-- bloquea duplicados en estados activos pero permite re-registro tras archivar.

begin;
select plan(3);

-- Setup
insert into public.companies (id, name, slug) values
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'Unique Co', 'unique-co');

-- Test 1: insert inicial OK
insert into public.workers (id, company_id, email, phone, first_name, last_name) values
  ('55555555-5555-5555-5555-555555555555',
   'dddddddd-dddd-dddd-dddd-dddddddddddd',
   'dup@x.com', '600000010', 'W1', 'Test');

select results_eq(
  $$ select count(*)::int from public.workers where email = 'dup@x.com' $$,
  $$ values (1) $$,
  'first insert with email succeeds'
);

-- Test 2: insert duplicado mismo email + mismo company falla
select throws_ok(
  $$ insert into public.workers (company_id, email, phone, first_name, last_name)
     values ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'dup@x.com', '600000011', 'W2', 'Test') $$,
  '23505',
  NULL,
  'duplicate email in same company while active raises unique_violation'
);

-- Test 3: archivar primero, luego insert con mismo email funciona
update public.workers set archived_at = now()
  where id = '55555555-5555-5555-5555-555555555555';

insert into public.workers (company_id, email, phone, first_name, last_name) values
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'dup@x.com', '600000012', 'W3', 'Test');

select results_eq(
  $$ select count(*)::int from public.workers where email = 'dup@x.com' and archived_at is null $$,
  $$ values (1) $$,
  'after archiving original, re-registration with same email succeeds'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Ejecutar tests**

```bash
npx supabase test db
```

Esperado: TODOS PASS.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/workers_unique_email_partial.sql
git commit -m "test(db): workers partial unique index allows re-registration after archive"
```

---

## Phase 3 — Shared helpers (JWT, email templates, Resend)

### Task 6: Helper `_shared/jwt.ts` + tests

**Files:**
- Create: `supabase/functions/_shared/jwt.ts`
- Create: `supabase/functions/_shared/jwt.test.ts`

- [ ] **Step 1: Escribir test PRIMERO (TDD)**

Crear `supabase/functions/_shared/jwt.test.ts` con contenido EXACTO:

```ts
import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";

// Set a deterministic secret for tests BEFORE importing the helper
Deno.env.set("SUPABASE_JWT_SECRET", "test-secret-at-least-32-chars-long-aaaaaa");

const { signVerificationToken, verifyVerificationToken } = await import("./jwt.ts");

Deno.test("sign+verify roundtrip preserves payload", async () => {
  const payload = { foo: "bar", num: 42 };
  const token = await signVerificationToken(payload, 60);
  const verified = await verifyVerificationToken<typeof payload & { exp: number }>(token);
  assertEquals(verified.foo, "bar");
  assertEquals(verified.num, 42);
  // exp should be ~now + 60
  const now = Math.floor(Date.now() / 1000);
  assertEquals(verified.exp > now, true);
  assertEquals(verified.exp <= now + 61, true);
});

Deno.test("verify rejects expired token", async () => {
  // Sign with -10s ttl (already expired)
  const token = await signVerificationToken({ foo: "bar" }, -10);
  await assertRejects(
    async () => await verifyVerificationToken(token),
    Error,
  );
});

Deno.test("verify rejects token with wrong signature", async () => {
  const token = await signVerificationToken({ foo: "bar" }, 60);
  // Tamper with the signature (last segment)
  const parts = token.split(".");
  parts[2] = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const tampered = parts.join(".");
  await assertRejects(
    async () => await verifyVerificationToken(tampered),
    Error,
  );
});
```

- [ ] **Step 2: Verificar que el test falla (import inexistente)**

```bash
"/c/Users/germ1/.deno/bin/deno.exe" test --allow-all supabase/functions/_shared/jwt.test.ts 2>&1 | tail -5
```

Esperado: FAIL "Module not found" o similar.

- [ ] **Step 3: Implementar `_shared/jwt.ts`**

```ts
import { create, verify } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

async function getKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("SUPABASE_JWT_SECRET");
  if (!secret) throw new Error("missing_jwt_secret");
  return await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signVerificationToken(
  payload: Record<string, unknown>,
  ttlSeconds: number,
): Promise<string> {
  const key = await getKey();
  const now = Math.floor(Date.now() / 1000);
  return await create(
    { alg: "HS256", typ: "JWT" },
    { ...payload, exp: now + ttlSeconds },
    key,
  );
}

export async function verifyVerificationToken<T>(token: string): Promise<T> {
  const key = await getKey();
  const payload = await verify(token, key);
  return payload as T;
}
```

- [ ] **Step 4: Verificar que los tests pasan**

```bash
"/c/Users/germ1/.deno/bin/deno.exe" test --allow-all supabase/functions/_shared/jwt.test.ts 2>&1 | tail -8
```

Esperado: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/jwt.ts supabase/functions/_shared/jwt.test.ts
git commit -m "feat(functions): add jwt helper for email verification tokens"
```

---

### Task 7: Helper `_shared/email-templates.ts`

**Files:**
- Create: `supabase/functions/_shared/email-templates.ts`

- [ ] **Step 1: Crear el módulo de templates**

Crear `supabase/functions/_shared/email-templates.ts` con contenido EXACTO:

```ts
// Templates HTML embebidos como string. Placeholders {{var}} resueltos por
// el helper renderTemplate de _shared/resend.ts.
//
// Mobile-friendly, estilos inline para compatibilidad Gmail/Outlook.
// El diseño visual final llegará en fases posteriores (Stitch).

export const workerVerificationTemplate = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirma tu inscripción</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #111;">
  <h2 style="color: #111;">Confirma tu inscripción en {{company_name}}</h2>
  <p>Hola,</p>
  <p>Has solicitado inscribirte en la agenda de candidatos de <strong>{{company_name}}</strong>. Para completar tu registro, pulsa el botón:</p>
  <p style="text-align: center; margin: 30px 0;">
    <a href="{{verify_url}}" style="background: #000; color: #fff; padding: 14px 28px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">Confirmar inscripción</a>
  </p>
  <p style="font-size: 14px; color: #666;">O copia esta URL en tu navegador:<br><code style="word-break: break-all;">{{verify_url}}</code></p>
  <p style="font-size: 14px; color: #999; margin-top: 30px; border-top: 1px solid #eee; padding-top: 16px;">El enlace caduca en 24 horas. Si no fuiste tú, ignora este email.</p>
</body>
</html>`;

export const workerApprovedTemplate = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Estás aprobado</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #111;">
  <h2 style="color: #111;">¡Bienvenido a {{company_name}}, {{worker_first_name}}!</h2>
  <p>Te hemos aprobado en nuestra agenda de candidatos. Cuando tengamos un evento donde encajes, te avisaremos por email con los detalles.</p>
  <p>No tienes que hacer nada por ahora. Ya estás en nuestra lista activa.</p>
  <p style="font-size: 14px; color: #999; margin-top: 30px; border-top: 1px solid #eee; padding-top: 16px;">Si tienes alguna duda, responde a este email.</p>
</body>
</html>`;
```

- [ ] **Step 2: Commit (sin test propio — los templates son strings; se valida indirectamente por los tests de las funciones que los usan)**

```bash
git add supabase/functions/_shared/email-templates.ts
git commit -m "feat(functions): add HTML email templates as TS string exports"
```

---

### Task 8: Helper `_shared/resend.ts` + tests

**Files:**
- Create: `supabase/functions/_shared/resend.ts`
- Create: `supabase/functions/_shared/resend.test.ts`

- [ ] **Step 1: Escribir test PRIMERO**

Crear `supabase/functions/_shared/resend.test.ts` con contenido EXACTO:

```ts
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

// Stub admin client para los tests
function buildMockAdmin(companyRow: { email_sender_address: string | null; email_sender_verified_at: string | null }) {
  return {
    from(_table: string) {
      return {
        select(_cols: string) {
          return {
            eq(_col: string, _val: string) {
              return {
                single: () => Promise.resolve({ data: companyRow, error: null }),
              };
            },
          };
        },
      };
    },
    // deno-lint-ignore no-explicit-any
  } as any;
}

const { sendEmail, renderTemplate } = await import("./resend.ts");

Deno.test("renderTemplate replaces {{vars}} with values", () => {
  const out = renderTemplate("Hola {{name}}, eres de {{company}}.", {
    name: "Ana",
    company: "Eventos Pérez",
  });
  assertEquals(out, "Hola Ana, eres de Eventos Pérez.");
});

Deno.test("renderTemplate leaves unknown vars empty", () => {
  const out = renderTemplate("Hola {{name}}, {{unknown}}.", { name: "Ana" });
  assertEquals(out, "Hola Ana, .");
});

Deno.test("sendEmail mocks to console.log when RESEND_API_KEY missing", async () => {
  Deno.env.delete("RESEND_API_KEY");
  const admin = buildMockAdmin({ email_sender_address: null, email_sender_verified_at: null });
  const result = await sendEmail(
    { companyId: "test", to: "to@x.com", subject: "S", html: "<p>H</p>" },
    admin,
  );
  assertEquals(result.mocked, true);
});

Deno.test("sendEmail uses tenant sender when verified", async () => {
  Deno.env.set("RESEND_API_KEY", "re_fake_test_key");

  const admin = buildMockAdmin({
    email_sender_address: "noreply@cliente.com",
    email_sender_verified_at: new Date().toISOString(),
  });

  // Mock fetch to capture the request
  let capturedBody: string | null = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((_url: string, opts: { body?: string }) => {
    capturedBody = opts.body ?? null;
    return Promise.resolve(
      new Response(JSON.stringify({ id: "test-email-id" }), { status: 200 }),
    );
  }) as typeof fetch;

  try {
    await sendEmail(
      { companyId: "test", to: "to@x.com", subject: "S", html: "<p>H</p>" },
      admin,
    );
    assertStringIncludes(capturedBody!, '"from":"noreply@cliente.com"');
  } finally {
    globalThis.fetch = originalFetch;
    Deno.env.delete("RESEND_API_KEY");
  }
});

Deno.test("sendEmail falls back to shared sender when tenant not verified", async () => {
  Deno.env.set("RESEND_API_KEY", "re_fake_test_key");

  const admin = buildMockAdmin({
    email_sender_address: "noreply@cliente.com",
    email_sender_verified_at: null,  // not verified yet
  });

  let capturedBody: string | null = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((_url: string, opts: { body?: string }) => {
    capturedBody = opts.body ?? null;
    return Promise.resolve(
      new Response(JSON.stringify({ id: "test-email-id" }), { status: 200 }),
    );
  }) as typeof fetch;

  try {
    await sendEmail(
      { companyId: "test", to: "to@x.com", subject: "S", html: "<p>H</p>" },
      admin,
    );
    assertStringIncludes(capturedBody!, '"from":"noreply@notify.ruanodev.com"');
  } finally {
    globalThis.fetch = originalFetch;
    Deno.env.delete("RESEND_API_KEY");
  }
});
```

- [ ] **Step 2: Verificar que el test falla (módulo no existe)**

```bash
"/c/Users/germ1/.deno/bin/deno.exe" test --allow-all supabase/functions/_shared/resend.test.ts 2>&1 | tail -5
```

Esperado: FAIL "Module not found".

- [ ] **Step 3: Implementar `_shared/resend.ts`**

```ts
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const DEFAULT_SENDER = "noreply@notify.ruanodev.com";

type SendEmailArgs = {
  companyId: string;
  to: string;
  subject: string;
  html: string;
};

type SendEmailResult = {
  id?: string;
  mocked?: boolean;
};

async function resolveSender(companyId: string, admin: SupabaseClient): Promise<string> {
  const { data } = await admin
    .from("companies")
    .select("email_sender_address, email_sender_verified_at")
    .eq("id", companyId)
    .single();

  if (data && data.email_sender_verified_at && data.email_sender_address) {
    return data.email_sender_address;
  }
  return DEFAULT_SENDER;
}

export async function sendEmail(
  args: SendEmailArgs,
  adminOverride?: SupabaseClient,
): Promise<SendEmailResult> {
  const admin = adminOverride ?? createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const from = await resolveSender(args.companyId, admin);
  const apiKey = Deno.env.get("RESEND_API_KEY");

  if (!apiKey) {
    console.log("[resend mock]", { from, to: args.to, subject: args.subject });
    return { mocked: true };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: args.to,
      subject: args.subject,
      html: args.html,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`resend_failed: ${res.status} ${errorText}`);
  }

  return await res.json() as SendEmailResult;
}

export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/{{(\w+)}}/g, (_, k) => vars[k] ?? "");
}
```

- [ ] **Step 4: Verificar tests pasan**

```bash
"/c/Users/germ1/.deno/bin/deno.exe" test --allow-all supabase/functions/_shared/resend.test.ts 2>&1 | tail -10
```

Esperado: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/resend.ts supabase/functions/_shared/resend.test.ts
git commit -m "feat(functions): add resend helper with per-tenant sender resolver"
```

---

## Phase 4 — Edge Functions (4 nuevas)

### Task 9: Edge Function `company-by-slug`

**Files:**
- Create: `supabase/functions/company-by-slug/index.ts`
- Create: `supabase/functions/company-by-slug/index.test.ts`
- Modify: `supabase/config.toml` (registra la function con verify_jwt = false)

- [ ] **Step 1: Generar boilerplate**

```bash
npx supabase functions new company-by-slug
```

- [ ] **Step 2: Editar `supabase/config.toml` para `verify_jwt = false`**

Buscar la sección `[functions.company-by-slug]` que `supabase functions new` añadió y asegurar:

```toml
[functions.company-by-slug]
enabled = true
verify_jwt = false
```

- [ ] **Step 3: Escribir test PRIMERO**

Reemplazar contenido de `supabase/functions/company-by-slug/index.test.ts`:

```ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.env.set("SUPABASE_URL", "http://stub");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "stub-key");

// Mock admin: returns company depending on slug
// deno-lint-ignore no-explicit-any
function buildAdmin(rows: Record<string, { name: string } | null>): any {
  return {
    from(_table: string) {
      return {
        select(_cols: string) {
          return {
            eq(_col: string, slug: string) {
              return {
                maybeSingle: () => Promise.resolve({
                  data: rows[slug] ?? null,
                  error: null,
                }),
              };
            },
          };
        },
      };
    },
  };
}

const { default: handler } = await import("./index.ts");

Deno.test("rejects non-GET", async () => {
  const req = new Request("http://localhost/company-by-slug", { method: "POST" });
  const res = await handler(req);
  assertEquals(res.status, 405);
});

Deno.test("400 when slug query param missing", async () => {
  const req = new Request("http://localhost/company-by-slug", { method: "GET" });
  const res = await handler(req, buildAdmin({}));
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "missing_slug");
});

Deno.test("200 with name when slug exists", async () => {
  const req = new Request("http://localhost/company-by-slug?slug=eventos-perez", { method: "GET" });
  const res = await handler(req, buildAdmin({ "eventos-perez": { name: "Eventos Pérez" } }));
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.name, "Eventos Pérez");
});

Deno.test("404 when slug not found", async () => {
  const req = new Request("http://localhost/company-by-slug?slug=ghost", { method: "GET" });
  const res = await handler(req, buildAdmin({}));
  assertEquals(res.status, 404);
  const body = await res.json();
  assertEquals(body.error, "not_found");
});
```

- [ ] **Step 4: Verificar que falla**

```bash
"/c/Users/germ1/.deno/bin/deno.exe" test --allow-all supabase/functions/company-by-slug/index.test.ts 2>&1 | tail -5
```

Esperado: FAIL (handler no exporta default todavía).

- [ ] **Step 5: Implementar `index.ts`**

Reemplazar contenido de `supabase/functions/company-by-slug/index.ts`:

```ts
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";

export default async function handler(
  req: Request,
  adminOverride?: SupabaseClient,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "method_not_allowed" }),
      { status: 405, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }

  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");

  if (!slug) {
    return new Response(
      JSON.stringify({ error: "missing_slug" }),
      { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }

  const admin = adminOverride ?? createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data } = await admin
    .from("companies")
    .select("name")
    .eq("slug", slug)
    .maybeSingle();

  if (!data) {
    return new Response(
      JSON.stringify({ error: "not_found" }),
      { status: 404, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({ name: data.name }),
    { status: 200, headers: { ...corsHeaders, "content-type": "application/json" } },
  );
}

if (import.meta.main) {
  Deno.serve((req) => handler(req));
}
```

- [ ] **Step 6: Verificar tests pasan**

```bash
"/c/Users/germ1/.deno/bin/deno.exe" test --allow-all supabase/functions/company-by-slug/index.test.ts 2>&1 | tail -8
```

Esperado: 4 passed.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/company-by-slug/ supabase/config.toml
git commit -m "feat(functions): add company-by-slug public endpoint"
```

---

### Task 10: Edge Function `request-worker-registration`

**Files:**
- Create: `supabase/functions/request-worker-registration/index.ts`
- Create: `supabase/functions/request-worker-registration/index.test.ts`
- Modify: `supabase/config.toml` (verify_jwt = false)

- [ ] **Step 1: Generar boilerplate**

```bash
npx supabase functions new request-worker-registration
```

- [ ] **Step 2: Editar config.toml**

```toml
[functions.request-worker-registration]
enabled = true
verify_jwt = false
```

- [ ] **Step 3: Escribir test PRIMERO**

Contenido EXACTO de `supabase/functions/request-worker-registration/index.test.ts`:

```ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.env.set("SUPABASE_URL", "http://stub");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "stub-key");
Deno.env.set("SUPABASE_JWT_SECRET", "test-secret-at-least-32-chars-long-aaaaaa");
Deno.env.set("SITE_URL", "http://localhost:5173");

// Stub admin con company lookup
// deno-lint-ignore no-explicit-any
function buildAdmin(companyBySlug: Record<string, { id: string; name: string } | null>, opts?: { senderRow?: { email_sender_address: string | null; email_sender_verified_at: string | null } }): any {
  return {
    from(table: string) {
      return {
        select(_cols: string) {
          return {
            eq(_col: string, val: string) {
              return {
                maybeSingle: () => Promise.resolve({
                  data: table === "companies" ? companyBySlug[val] ?? null : null,
                  error: null,
                }),
                single: () => Promise.resolve({
                  data: opts?.senderRow ?? { email_sender_address: null, email_sender_verified_at: null },
                  error: null,
                }),
              };
            },
          };
        },
      };
    },
  };
}

const { default: handler } = await import("./index.ts");

const VALID_BODY = {
  company_slug: "eventos-perez",
  first_name: "Ana",
  last_name: "López",
  email: "ana@x.com",
  phone: "600000123",
  languages: ["español"],
  website: "",
};

Deno.test("rejects non-POST", async () => {
  const req = new Request("http://localhost/x", { method: "GET" });
  const res = await handler(req);
  assertEquals(res.status, 405);
});

Deno.test("400 validation when phone invalid", async () => {
  const req = new Request("http://localhost/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...VALID_BODY, phone: "abc" }),
  });
  const res = await handler(req, buildAdmin({}));
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "validation");
});

Deno.test("404 when company slug does not exist", async () => {
  const req = new Request("http://localhost/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(VALID_BODY),
  });
  const res = await handler(req, buildAdmin({}));  // no companies known
  assertEquals(res.status, 404);
  const body = await res.json();
  assertEquals(body.error, "company_not_found");
});

Deno.test("200 silent when honeypot website is filled", async () => {
  const req = new Request("http://localhost/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...VALID_BODY, website: "https://spambot.example" }),
  });
  const res = await handler(req, buildAdmin({}));
  assertEquals(res.status, 400);  // Zod schema rejects because website must be length 0
  // (Implementation choice: Zod validates first, returns validation error)
});

Deno.test("200 when valid body and company found — sends email (mocked since no RESEND_API_KEY)", async () => {
  const req = new Request("http://localhost/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(VALID_BODY),
  });
  const res = await handler(
    req,
    buildAdmin({ "eventos-perez": { id: "co-123", name: "Eventos Pérez" } }),
  );
  assertEquals(res.status, 200);
});
```

- [ ] **Step 4: Verificar que falla**

```bash
"/c/Users/germ1/.deno/bin/deno.exe" test --allow-all supabase/functions/request-worker-registration/index.test.ts 2>&1 | tail -5
```

Esperado: FAIL (handler no implementado).

- [ ] **Step 5: Implementar `index.ts`**

Contenido EXACTO de `supabase/functions/request-worker-registration/index.ts`:

```ts
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { z } from "https://esm.sh/zod@3.23.8";
import { corsHeaders } from "../_shared/cors.ts";
import { signVerificationToken } from "../_shared/jwt.ts";
import { renderTemplate, sendEmail } from "../_shared/resend.ts";
import { workerVerificationTemplate } from "../_shared/email-templates.ts";

const bodySchema = z.object({
  company_slug: z.string().min(1),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().regex(/^\+?[0-9]{9,15}$/),
  postal_code: z.string().regex(/^\d{5}$/).optional(),
  languages: z.array(z.enum([
    "español", "catalán", "inglés", "francés", "alemán", "italiano",
    "portugués", "gallego", "euskera", "árabe", "chino", "ruso", "otros",
  ])).max(8),
  experience_summary: z.string().max(500).optional(),
  website: z.string().length(0),  // honeypot
});

export default async function handler(
  req: Request,
  adminOverride?: SupabaseClient,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "method_not_allowed" }),
      { status: 405, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (e) {
    return new Response(
      JSON.stringify({
        error: "validation",
        details: e instanceof z.ZodError ? e.flatten() : String(e),
      }),
      { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }

  // Honeypot check is enforced by Zod schema (website must be length 0).
  // If Zod passed, website is empty.

  const admin = adminOverride ?? createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: company } = await admin
    .from("companies")
    .select("id, name")
    .eq("slug", body.company_slug)
    .maybeSingle();

  if (!company) {
    return new Response(
      JSON.stringify({ error: "company_not_found" }),
      { status: 404, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }

  // Strip honeypot and slug from form_data
  const { website: _w, company_slug: _s, ...formData } = body;

  const token = await signVerificationToken(
    { form_data: formData, company_id: company.id },
    86400,  // 24h
  );

  const siteUrl = Deno.env.get("SITE_URL") ?? "http://localhost:5173";
  const verifyUrl = `${siteUrl}/candidato/verificar?token=${token}`;

  const html = renderTemplate(workerVerificationTemplate, {
    company_name: company.name,
    verify_url: verifyUrl,
  });

  try {
    await sendEmail({
      companyId: company.id,
      to: body.email,
      subject: `Confirma tu inscripción en ${company.name}`,
      html,
    }, admin);
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "email_send_failed", message: String(e) }),
      { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }

  return new Response(null, { status: 200, headers: corsHeaders });
}

if (import.meta.main) {
  Deno.serve((req) => handler(req));
}
```

- [ ] **Step 6: Verificar tests pasan**

```bash
"/c/Users/germ1/.deno/bin/deno.exe" test --allow-all supabase/functions/request-worker-registration/index.test.ts 2>&1 | tail -10
```

Esperado: 5 passed.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/request-worker-registration/ supabase/config.toml
git commit -m "feat(functions): add request-worker-registration with double opt-in start"
```

---

### Task 11: Edge Function `verify-worker-registration`

**Files:**
- Create: `supabase/functions/verify-worker-registration/index.ts`
- Create: `supabase/functions/verify-worker-registration/index.test.ts`
- Modify: `supabase/config.toml`

- [ ] **Step 1: Generar boilerplate**

```bash
npx supabase functions new verify-worker-registration
```

- [ ] **Step 2: Editar config.toml**

```toml
[functions.verify-worker-registration]
enabled = true
verify_jwt = false
```

- [ ] **Step 3: Escribir test PRIMERO**

Contenido EXACTO:

```ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.env.set("SUPABASE_URL", "http://stub");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "stub-key");
Deno.env.set("SUPABASE_JWT_SECRET", "test-secret-at-least-32-chars-long-aaaaaa");

const { signVerificationToken } = await import("../_shared/jwt.ts");

// Mock admin tracks inserts and worker lookups
type FakeAdminState = {
  workerExistsFor?: string;  // company_id where worker exists
  inserted: Array<Record<string, unknown>>;
};

// deno-lint-ignore no-explicit-any
function buildAdmin(state: FakeAdminState): any {
  return {
    from(table: string) {
      return {
        select(_cols: string) {
          return {
            eq(col: string, val: string) {
              if (table === "companies" && col === "id") {
                return {
                  single: () => Promise.resolve({
                    data: { name: "Test Co" },
                    error: null,
                  }),
                };
              }
              return {
                eq(_col2: string, _val2: string) {
                  return {
                    is(_col3: string, _val3: null) {
                      return {
                        maybeSingle: () => Promise.resolve({
                          data: state.workerExistsFor && state.workerExistsFor === val
                            ? { id: "existing-worker" }
                            : null,
                          error: null,
                        }),
                      };
                    },
                  };
                },
              };
            },
          };
        },
        insert(row: Record<string, unknown>) {
          state.inserted.push(row);
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  };
}

const { default: handler } = await import("./index.ts");

const VALID_FORM_DATA = {
  first_name: "Ana",
  last_name: "López",
  email: "ana@x.com",
  phone: "600000123",
  languages: ["español"],
};

Deno.test("400 invalid_token when JWT signature is bad", async () => {
  const req = new Request("http://localhost/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: "not-a-real-jwt" }),
  });
  const res = await handler(req, buildAdmin({ inserted: [] }));
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "invalid_token");
});

Deno.test("400 token_expired when JWT expired", async () => {
  const token = await signVerificationToken(
    { form_data: VALID_FORM_DATA, company_id: "co-123" },
    -10,  // already expired
  );
  const req = new Request("http://localhost/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
  const res = await handler(req, buildAdmin({ inserted: [] }));
  assertEquals(res.status, 400);
  const body = await res.json();
  // Distinguir expired vs invalid es opcional; aquí ambos caen en invalid_token
  // si djwt no diferencia. Aceptamos invalid_token o token_expired.
  assertEquals(["invalid_token", "token_expired"].includes(body.error), true);
});

Deno.test("200 and inserts worker when token valid and worker does not exist", async () => {
  const state: FakeAdminState = { inserted: [] };
  const token = await signVerificationToken(
    { form_data: VALID_FORM_DATA, company_id: "co-123" },
    300,
  );
  const req = new Request("http://localhost/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
  const res = await handler(req, buildAdmin(state));
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.company_name, "Test Co");
  assertEquals(state.inserted.length, 1);
  assertEquals(state.inserted[0].email, "ana@x.com");
  assertEquals(state.inserted[0].company_id, "co-123");
});

Deno.test("200 idempotent when worker already exists (no insert)", async () => {
  const state: FakeAdminState = { workerExistsFor: "co-123", inserted: [] };
  const token = await signVerificationToken(
    { form_data: VALID_FORM_DATA, company_id: "co-123" },
    300,
  );
  const req = new Request("http://localhost/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
  const res = await handler(req, buildAdmin(state));
  assertEquals(res.status, 200);
  assertEquals(state.inserted.length, 0, "should not insert when worker already exists");
});
```

- [ ] **Step 4: Verificar que falla**

```bash
"/c/Users/germ1/.deno/bin/deno.exe" test --allow-all supabase/functions/verify-worker-registration/index.test.ts 2>&1 | tail -5
```

Esperado: FAIL.

- [ ] **Step 5: Implementar `index.ts`**

```ts
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { z } from "https://esm.sh/zod@3.23.8";
import { corsHeaders } from "../_shared/cors.ts";
import { verifyVerificationToken } from "../_shared/jwt.ts";

const bodySchema = z.object({
  token: z.string().min(1),
});

type TokenPayload = {
  form_data: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    postal_code?: string;
    languages: string[];
    experience_summary?: string;
  };
  company_id: string;
  exp: number;
};

export default async function handler(
  req: Request,
  adminOverride?: SupabaseClient,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "method_not_allowed" }),
      { status: 405, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return new Response(
      JSON.stringify({ error: "validation" }),
      { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }

  let payload: TokenPayload;
  try {
    payload = await verifyVerificationToken<TokenPayload>(body.token);
  } catch (e) {
    const msg = String(e).toLowerCase();
    const code = msg.includes("exp") ? "token_expired" : "invalid_token";
    return new Response(
      JSON.stringify({ error: code }),
      { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }

  const admin = adminOverride ?? createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Resolve company name for response
  const { data: company } = await admin
    .from("companies")
    .select("name")
    .eq("id", payload.company_id)
    .single();

  if (!company) {
    return new Response(
      JSON.stringify({ error: "company_not_found" }),
      { status: 404, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }

  // Check if worker already exists (idempotent)
  const { data: existing } = await admin
    .from("workers")
    .select("id")
    .eq("company_id", payload.company_id)
    .eq("email", payload.form_data.email.toLowerCase())
    .is("archived_at", null)
    .maybeSingle();

  if (!existing) {
    // INSERT new worker (status defaults to 'pending')
    await admin.from("workers").insert({
      company_id: payload.company_id,
      email: payload.form_data.email,
      phone: payload.form_data.phone,
      first_name: payload.form_data.first_name,
      last_name: payload.form_data.last_name,
      postal_code: payload.form_data.postal_code,
      languages: payload.form_data.languages,
      experience_summary: payload.form_data.experience_summary,
    });
  }

  return new Response(
    JSON.stringify({ company_name: company.name }),
    { status: 200, headers: { ...corsHeaders, "content-type": "application/json" } },
  );
}

if (import.meta.main) {
  Deno.serve((req) => handler(req));
}
```

- [ ] **Step 6: Verificar tests pasan**

```bash
"/c/Users/germ1/.deno/bin/deno.exe" test --allow-all supabase/functions/verify-worker-registration/index.test.ts 2>&1 | tail -10
```

Esperado: 4 passed.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/verify-worker-registration/ supabase/config.toml
git commit -m "feat(functions): add verify-worker-registration with idempotent worker insert"
```

---

### Task 12: Edge Function `approve-worker`

**Files:**
- Create: `supabase/functions/approve-worker/index.ts`
- Create: `supabase/functions/approve-worker/index.test.ts`
- Modify: `supabase/config.toml` (verify_jwt = true)

- [ ] **Step 1: Generar boilerplate**

```bash
npx supabase functions new approve-worker
```

- [ ] **Step 2: Editar config.toml — verify_jwt = TRUE (admin-only)**

```toml
[functions.approve-worker]
enabled = true
verify_jwt = true
```

- [ ] **Step 3: Escribir test PRIMERO**

**Nota:** el handler extrae `company_id` del claim JWT del Authorization header (decodificado, no re-verificado porque Supabase ya lo validó con verify_jwt=true) y filtra explícitamente todas las queries por ese tenant. Los tests inyectan un Authorization header con un JWT no-firmado (header + payload + ".sig") porque el handler solo decodifica el payload, no verifica firma.

```ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.env.set("SUPABASE_URL", "http://stub");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "stub-key");

// Construye un JWT decodificable con el company_id deseado.
// La firma es bogus pero el handler no la verifica (Supabase lo hizo).
function makeAdminJwt(companyId: string): string {
  const b64url = (obj: object) =>
    btoa(JSON.stringify(obj))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const header = b64url({ alg: "HS256", typ: "JWT" });
  const payload = b64url({ sub: "admin-1", company_id: companyId });
  return `${header}.${payload}.bogus-signature`;
}

type FakeAdminState = {
  worker?: { id: string; email: string; first_name: string; status: string; company_id: string };
  tenantFilterUsed?: string;  // captura el company_id por el que se filtró
  updated: boolean;
};

// deno-lint-ignore no-explicit-any
function buildAdmin(state: FakeAdminState): any {
  return {
    from(table: string) {
      const queryChain = {
        _filters: {} as Record<string, string>,
        select(_cols: string) {
          return this;
        },
        eq(col: string, val: string) {
          this._filters[col] = val;
          if (col === "company_id") state.tenantFilterUsed = val;
          return this;
        },
        maybeSingle() {
          if (table === "workers") {
            // Solo devolver el worker si los filtros coinciden con su tenant
            if (state.worker
                && this._filters.id === state.worker.id
                && (!this._filters.company_id || this._filters.company_id === state.worker.company_id)) {
              return Promise.resolve({ data: state.worker, error: null });
            }
            return Promise.resolve({ data: null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        single() {
          if (table === "companies") {
            return Promise.resolve({
              data: { name: "Test Co", email_sender_address: null, email_sender_verified_at: null },
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        },
      };
      return {
        select: queryChain.select.bind(queryChain),
        update(_changes: Record<string, unknown>) {
          state.updated = true;
          return {
            eq(_col: string, _val: string) {
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
      };
    },
  };
}

const { default: handler } = await import("./index.ts");

const ADMIN_CO_A = makeAdminJwt("co-a");
const ADMIN_CO_B = makeAdminJwt("co-b");

Deno.test("401 when Authorization header missing", async () => {
  const req = new Request("http://localhost/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ worker_id: "11111111-1111-1111-1111-111111111111" }),
  });
  const res = await handler(req, buildAdmin({ updated: false }));
  assertEquals(res.status, 401);
});

Deno.test("400 validation when worker_id missing", async () => {
  const req = new Request("http://localhost/x", {
    method: "POST",
    headers: { "content-type": "application/json", "authorization": `Bearer ${ADMIN_CO_A}` },
    body: JSON.stringify({}),
  });
  const res = await handler(req, buildAdmin({ updated: false }));
  assertEquals(res.status, 400);
});

Deno.test("403 when worker belongs to a different tenant (cross-tenant attack blocked)", async () => {
  const state: FakeAdminState = {
    worker: { id: "11111111-1111-1111-1111-111111111111", email: "w@x.com", first_name: "W", status: "pending", company_id: "co-b" },
    updated: false,
  };
  const req = new Request("http://localhost/x", {
    method: "POST",
    headers: { "content-type": "application/json", "authorization": `Bearer ${ADMIN_CO_A}` },
    body: JSON.stringify({ worker_id: "11111111-1111-1111-1111-111111111111" }),
  });
  const res = await handler(req, buildAdmin(state));
  assertEquals(res.status, 403);
  assertEquals(state.tenantFilterUsed, "co-a", "must filter SELECT by admin's company_id");
  assertEquals(state.updated, false, "must not UPDATE when forbidden");
});

Deno.test("409 not_pending when worker status is already approved", async () => {
  const state: FakeAdminState = {
    worker: { id: "11111111-1111-1111-1111-111111111111", email: "w@x.com", first_name: "W", status: "approved", company_id: "co-a" },
    updated: false,
  };
  const req = new Request("http://localhost/x", {
    method: "POST",
    headers: { "content-type": "application/json", "authorization": `Bearer ${ADMIN_CO_A}` },
    body: JSON.stringify({ worker_id: "11111111-1111-1111-1111-111111111111" }),
  });
  const res = await handler(req, buildAdmin(state));
  assertEquals(res.status, 409);
  const body = await res.json();
  assertEquals(body.error, "not_pending");
});

Deno.test("200 ok when pending worker approved (email mocked sin RESEND_API_KEY)", async () => {
  Deno.env.delete("RESEND_API_KEY");
  const state: FakeAdminState = {
    worker: { id: "11111111-1111-1111-1111-111111111111", email: "w@x.com", first_name: "W", status: "pending", company_id: "co-a" },
    updated: false,
  };
  const req = new Request("http://localhost/x", {
    method: "POST",
    headers: { "content-type": "application/json", "authorization": `Bearer ${ADMIN_CO_A}` },
    body: JSON.stringify({ worker_id: "11111111-1111-1111-1111-111111111111" }),
  });
  const res = await handler(req, buildAdmin(state));
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.ok, true);
  assertEquals(state.updated, true, "UPDATE called");
});
```

- [ ] **Step 4: Verificar que falla**

```bash
"/c/Users/germ1/.deno/bin/deno.exe" test --allow-all supabase/functions/approve-worker/index.test.ts 2>&1 | tail -5
```

Esperado: FAIL.

- [ ] **Step 5: Implementar `index.ts`**

```ts
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { z } from "https://esm.sh/zod@3.23.8";
import { corsHeaders } from "../_shared/cors.ts";
import { renderTemplate, sendEmail } from "../_shared/resend.ts";
import { workerApprovedTemplate } from "../_shared/email-templates.ts";

const bodySchema = z.object({
  worker_id: z.string().uuid(),
});

/**
 * Decodifica el payload del JWT del Authorization header sin verificar firma.
 * Supabase ya validó el JWT con verify_jwt=true antes de invocar la function.
 * Aquí solo extraemos el claim company_id que el Auth Hook inyectó.
 */
function getAdminCompanyId(req: Request): string | null {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer /, "").trim();
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = "=".repeat((4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(atob(b64 + pad)) as { company_id?: string };
    return payload.company_id ?? null;
  } catch {
    return null;
  }
}

export default async function handler(
  req: Request,
  adminOverride?: SupabaseClient,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "method_not_allowed" }),
      { status: 405, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }

  // Extraer company_id del JWT del admin (Supabase ya verificó la firma).
  // Este claim viene del Auth Hook custom_access_token_hook configurado en Fase 0.
  const adminCompanyId = getAdminCompanyId(req);
  if (!adminCompanyId) {
    return new Response(
      JSON.stringify({ error: "no_company_claim" }),
      { status: 401, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (e) {
    return new Response(
      JSON.stringify({
        error: "validation",
        details: e instanceof z.ZodError ? e.flatten() : String(e),
      }),
      { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }

  const admin = adminOverride ?? createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // SELECT con filtro EXPLÍCITO por tenant. service_role bypasea RLS, así que
  // este filtro es la barrera anti cross-tenant.
  const { data: worker } = await admin
    .from("workers")
    .select("id, email, first_name, status, company_id")
    .eq("id", body.worker_id)
    .eq("company_id", adminCompanyId)
    .maybeSingle();

  if (!worker) {
    return new Response(
      JSON.stringify({ error: "not_found_or_forbidden" }),
      { status: 403, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }

  if (worker.status !== "pending") {
    return new Response(
      JSON.stringify({ error: "not_pending" }),
      { status: 409, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }

  // UPDATE con doble filtro (id + company_id) por defensa en profundidad.
  const { error: updateErr } = await admin
    .from("workers")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
    })
    .eq("id", body.worker_id)
    .eq("company_id", adminCompanyId);

  if (updateErr) {
    return new Response(
      JSON.stringify({ error: "update_failed", message: updateErr.message }),
      { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }

  // Enviar email de bienvenida — no bloqueante si falla.
  const { data: company } = await admin
    .from("companies")
    .select("name")
    .eq("id", worker.company_id)
    .single();

  const companyName = company?.name ?? "tu empresa";
  const html = renderTemplate(workerApprovedTemplate, {
    company_name: companyName,
    worker_first_name: worker.first_name,
  });

  let emailWarning = false;
  try {
    await sendEmail({
      companyId: worker.company_id,
      to: worker.email,
      subject: `¡Te hemos aprobado en ${companyName}!`,
      html,
    }, admin);
  } catch (e) {
    console.error("[approve-worker] email send failed:", e);
    emailWarning = true;
  }

  return new Response(
    JSON.stringify({ ok: true, ...(emailWarning ? { email_warning: true } : {}) }),
    { status: 200, headers: { ...corsHeaders, "content-type": "application/json" } },
  );
}

if (import.meta.main) {
  Deno.serve((req) => handler(req));
}
```

- [ ] **Step 6: Verificar tests pasan**

```bash
"/c/Users/germ1/.deno/bin/deno.exe" test --allow-all supabase/functions/approve-worker/index.test.ts 2>&1 | tail -10
```

Esperado: 4 passed.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/approve-worker/ supabase/config.toml
git commit -m "feat(functions): add approve-worker with status update and welcome email"
```

---

## Phase 5 — Documentation update

### Task 13: Update README cloud setup runbook

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Editar la sección "Setup de Supabase Cloud" del README**

Buscar el bloque que lista las funciones a deployar (después de "Deployar (o redeployar) Edge Functions modificadas") y reemplazarlo por:

```bash
# Deployar (o redeployar) Edge Functions modificadas
npx supabase functions deploy signup-admin --no-verify-jwt
npx supabase functions deploy company-by-slug --no-verify-jwt
npx supabase functions deploy request-worker-registration --no-verify-jwt
npx supabase functions deploy verify-worker-registration --no-verify-jwt
npx supabase functions deploy approve-worker
```

Buscar la línea "Edge Functions deployadas hoy:" y añadir las nuevas:

```markdown
Edge Functions deployadas hoy:
- `signup-admin` (signup atómico admin + company + admin_user).
- `company-by-slug` (público, devuelve nombre de empresa por slug).
- `request-worker-registration` (público, inicia double opt-in del candidato).
- `verify-worker-registration` (público, confirma email y crea ficha worker).
- `approve-worker` (admin, marca worker approved + envía email).
```

Añadir después de las "Hooks activos hoy" una sección nueva:

```markdown
Env vars necesarias en Supabase cloud (secrets):
- `RESEND_API_KEY` (para envío de emails reales; sin esto las funciones que envían email los mockean a logs).
- `SITE_URL` (URL pública del frontend para construir enlaces de verificación; ej. `https://checkin-app.guiruamur.workers.dev`).

Setear con: `npx supabase secrets set NOMBRE=valor`.
```

Y actualizar la sección Roadmap añadiendo Fase 1a como completada (tag `v0.3.0-m2-phase1a`):

Buscar:
```markdown
  - **Fase 1 — Workers / agenda** (pendiente)
```

Reemplazar por:
```markdown
  - **Fase 1a — Workers backend** ✅ (`v0.3.0-m2-phase1a`): tabla workers, 4 Edge Functions, Resend integration, double opt-in
  - **Fase 1b — Workers frontend** (pendiente)
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs(readme): update cloud setup with new edge functions and env vars"
```

---

## Phase 6 — Smoke test local

### Task 14: Smoke E2E local con curl

**Files:** ninguno (verificación manual)

- [ ] **Step 1: Reset DB local**

```bash
npx supabase db reset
```

- [ ] **Step 2: Servir todas las funciones nuevas (en background)**

```bash
npx supabase functions serve --no-verify-jwt &
```

Esperado: arranca un proceso que sirve TODAS las funciones. Deja correr.

- [ ] **Step 3: Crear una company de test via signup-admin**

```bash
curl -sS -X POST http://127.0.0.1:54321/functions/v1/signup-admin \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@smoke.com","password":"password123","company_name":"Smoke Co","full_name":"Smoke Admin"}'
```

Esperado: `{"ok":true,"user_id":"...","company_id":"..."}`. Anota el `company_id`.

- [ ] **Step 4: Verificar `company-by-slug`**

Primero obtén el slug del company:

```bash
docker exec supabase_db_checkin-app psql -U postgres -c "select slug from public.companies where name='Smoke Co';"
```

Anota el slug (ej. `smoke-co-l2m4k7`). Luego:

```bash
curl -sS "http://127.0.0.1:54321/functions/v1/company-by-slug?slug=<SLUG>"
```

Esperado: `{"name":"Smoke Co"}`.

- [ ] **Step 5: Verificar `request-worker-registration`**

```bash
curl -sS -X POST http://127.0.0.1:54321/functions/v1/request-worker-registration \
  -H "Content-Type: application/json" \
  -d "{\"company_slug\":\"<SLUG>\",\"first_name\":\"Test\",\"last_name\":\"Worker\",\"email\":\"worker@x.com\",\"phone\":\"600000000\",\"languages\":[\"español\"],\"website\":\"\"}"
```

Esperado: respuesta vacía con HTTP 200.

En la terminal donde corre `supabase functions serve`, deberías ver un log tipo:
```
[resend mock] { from: "noreply@notify.ruanodev.com", to: "worker@x.com", subject: "Confirma tu inscripción en Smoke Co" }
```

- [ ] **Step 6: Verificar que la verificación crea la fila**

Necesitas el token JWT del email mockeado. Como el mock no lo devuelve, genera uno a mano para test:

```bash
# Usa el helper de jwt.ts directamente desde un script Deno rápido,
# o copia el token que apareció en los logs del email mockeado
# (si tu console.log mostró el HTML, ahí dentro está la URL con el token).
```

(El smoke E2E completo con captura automática del token es complicado en CLI; basta con verificar a OJO que el flujo se ejecuta. La cobertura completa está en los Deno tests.)

Alternativamente, ejecuta los tests Deno una vez más para confirmar TODO verde:

```bash
"/c/Users/germ1/.deno/bin/deno.exe" test --allow-all supabase/functions/
```

Esperado: 22+ tests passing (5 jwt + 5 resend + 4 company-by-slug + 5 request-worker + 4 verify-worker + 4 approve-worker + los 5 de signup-admin).

- [ ] **Step 7: Verificar pgTAP también**

```bash
npx supabase test db
```

Esperado: 25+ tests passing (10 anteriores + 2 workers_rls + 4 workers_audit_attached + 3 workers_unique_email_partial).

- [ ] **Step 8: Detener `supabase functions serve` (Ctrl+C o kill al PID)**

- [ ] **Step 9: No commit (es solo verificación)**

---

## Phase 7 — Push, PR, cloud setup

### Task 15: Push, PR a develop, cloud setup (esperar OK del usuario)

**Files:** ninguno (operación remota)

- [ ] **Step 1: PEDIR OK explícito al usuario antes de pushear**

Según project memory: nunca push sin confirmación.

- [ ] **Step 2: Push**

```bash
git push -u origin feat/m2-phase-1a-workers-backend
```

- [ ] **Step 3: Abrir PR contra develop**

```bash
gh pr create --base develop --head feat/m2-phase-1a-workers-backend \
  --title "M2 Fase 1a — Workers backend: schema + 4 Edge Functions + Resend + tests" \
  --body "(descripción detallada con tests pasados + lista de funciones nuevas + secrets requeridos en cloud)"
```

(Body completo: lista todas las nuevas tablas/funciones/tests, advierte sobre los pasos manuales de cloud setup tras el merge a main.)

- [ ] **Step 4: Esperar a que usuario mergee a develop**

- [ ] **Step 5: Tras merge a develop, PR develop → main (con OK)**

- [ ] **Step 6: Tras merge a main, aplicar en cloud (CON OK explícito en cada uno)**

```bash
npx supabase db push                                                # 1 nueva migración
npx supabase functions deploy company-by-slug --no-verify-jwt
npx supabase functions deploy request-worker-registration --no-verify-jwt
npx supabase functions deploy verify-worker-registration --no-verify-jwt
npx supabase functions deploy approve-worker                        # verify_jwt = true
npx supabase secrets set SITE_URL=https://checkin-app.guiruamur.workers.dev
# (Cuando esté lista cuenta Resend) npx supabase secrets set RESEND_API_KEY=re_xxx
```

- [ ] **Step 7: Smoke test contra producción**

```bash
curl -sS "https://ffvosnpfmdyabeeexmop.supabase.co/functions/v1/company-by-slug?slug=<SLUG>" \
  -H "apikey: sb_publishable_kiPdg-blh5OikwUoCLowZw_RXJEVuXw"
```

Esperado: `{"name":"..."}` si la company existe.

- [ ] **Step 8: Tag `v0.3.0-m2-phase1a` (con OK)**

```bash
git tag -a v0.3.0-m2-phase1a <merge-sha> -m "M2 Fase 1a — Workers backend"
git push origin v0.3.0-m2-phase1a
```

---

## Criterios de "Fase 1a hecha"

- [x] Migración `workers_and_company_email_sender.sql` aplicada en local + cloud.
- [x] Tabla `workers` con RLS, audit trigger, índices, UNIQUE parcial.
- [x] 3 columnas `email_sender_*` en `companies`, nullable.
- [x] Helpers `_shared/jwt.ts`, `_shared/resend.ts`, `_shared/email-templates.ts` con tests Deno.
- [x] 4 Edge Functions implementadas + tests Deno + deployadas en cloud.
- [x] 3 pgTAP tests nuevos (RLS, audit trigger, UNIQUE parcial).
- [x] README actualizado con cloud setup nuevo (functions + env vars).
- [x] Smoke E2E local OK.
- [x] Smoke cloud OK (al menos `company-by-slug`; `request-worker-registration` requiere Resend o se acepta el mock log).
- [x] PR fix branch → develop → main mergeado.
- [x] Tag `v0.3.0-m2-phase1a` empujado.
