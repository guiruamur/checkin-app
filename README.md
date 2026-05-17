# Checkin App

App web SaaS de **registro horario** para empresas de azafatos para eventos, conforme a la RD-Ley 8/2019 (España).

Estado actual: **M2 Fase 0 en producción**. Auth de admin atómica via Edge Function, multi-tenant con JWT claim, audit trigger genérico listo para las tablas de M2 Fase 1.

## Resumen

- Web para que los trabajadores hagan check-in/out desde su móvil, fichando vía QR de evento + PIN.
- Panel admin (PWA) para gestionar agenda de trabajadores, clientes, eventos y reportes.
- Multi-tenant: un mismo despliegue sirve a varias empresas aisladas con Row Level Security.

## Stack

- **Frontend**: Vite + React + TypeScript + Tailwind CSS, desplegado en Cloudflare Workers + Static Assets
- **Backend**: Supabase (Postgres + Auth + RLS + Edge Functions en Deno)
- **Emails**: Resend (a partir de M2 Fase 1)
- **Tests**: Vitest + React Testing Library + pgTAP + Deno test

## Desarrollo local

Prerequisitos: Node 22+, npm 10+, Docker Desktop, [Deno](https://deno.land/) (para tests de Edge Functions).

```bash
# 1. Instalar deps
npm install

# 2. Arrancar Supabase local (requiere Docker corriendo)
npx supabase start

# 3. Copiar .env.example a .env.local con los valores que muestra `supabase status`
cp .env.example .env.local
# editar .env.local

# 4. Dev server
npm run dev
```

Tests:

```bash
# Frontend (Vitest + RTL)
npm run test:run

# Base de datos (pgTAP)
npx supabase test db

# Edge Functions (Deno)
"$HOME/.deno/bin/deno" test --allow-all supabase/functions/signup-admin/index.test.ts
```

## Setup de Supabase Cloud (necesario después de cada migración nueva)

Cuando se mergea una rama que añade migraciones / Edge Functions nuevas, hay que aplicar dos cosas a mano en cloud (Cloudflare auto-deploy solo cubre el frontend):

```bash
# 1. Subir migraciones SQL
npx supabase db push

# 2. Deployar (o redeployar) Edge Functions modificadas
npx supabase functions deploy signup-admin --no-verify-jwt
npx supabase functions deploy company-by-slug --no-verify-jwt
npx supabase functions deploy request-worker-registration --no-verify-jwt
npx supabase functions deploy verify-worker-registration --no-verify-jwt
npx supabase functions deploy approve-worker
```

Si la rama añade un Supabase Auth Hook nuevo, también hay que **registrarlo a mano en el dashboard cloud**:

1. https://supabase.com/dashboard/project/ffvosnpfmdyabeeexmop/auth/hooks
2. Add hook → Custom Access Token → Postgres → schema `public` → función correspondiente → Enabled → Save.

Hooks activos hoy:
- `custom_access_token_hook` (inyecta `company_id` como claim JWT).

Env vars necesarias en Supabase cloud (secrets):
- `RESEND_API_KEY` (para envío de emails reales; sin esto las funciones que envían email los mockean a logs).
- `SITE_URL` (URL pública del frontend para construir enlaces de verificación; ej. `https://checkin-app.guiruamur.workers.dev`).

Setear con: `npx supabase secrets set NOMBRE=valor`.

Edge Functions deployadas hoy:
- `signup-admin` (signup atómico admin + company + admin_user).
- `company-by-slug` (público, devuelve nombre de empresa por slug).
- `request-worker-registration` (público, inicia double opt-in del candidato).
- `verify-worker-registration` (público, confirma email y crea ficha worker).
- `approve-worker` (admin, marca worker approved + envía email).

### ⚠️ White-label sender: NO setear `companies.email_sender_verified_at` a mano

Las columnas `email_sender_*` en `companies` están pensadas para que un día (M3+) haya una UI de configuración que verifique el dominio del cliente en Resend y rellene `email_sender_verified_at` solo cuando Resend confirme la verificación DNS.

Mientras esa UI no exista, **dejar estas columnas NULL**. Si alguien las rellena manualmente (SQL directo, admin DB UI) sin que Resend haya verificado el dominio:
- `request-worker-registration` y `approve-worker` intentarán mandar emails desde el dominio no verificado.
- Resend responderá 4xx, los emails NO llegarán al destinatario.
- En `approve-worker` el fallo se marca en el response con `email_warning: true` pero la aprobación sigue adelante.
- En `request-worker-registration` el fallo devuelve 500 y rompe el flujo del candidato.

El comment del SQL en `email_sender_verified_at` documenta esto a nivel BD.

### Tests cross-tenant — cobertura actual

Las pgTAP cubren el aislamiento RLS para queries directas. Para las Edge Functions admin-only (`approve-worker`), la barrera anti cross-tenant vive en el código (filtro explícito por `company_id` del JWT claim) y se testa solo a nivel mock (unit) y por smoke manual contra cloud. Una vez se monte CI con local Supabase, conviene añadir test de integración semi-real que dispare el handler con dos tenants y compruebe el rechazo end-to-end.

## Flujo de ramas

```
feature/* o feat/*  →  develop  →  main
       ↓                 ↓           ↓
     local           staging     producción
                     preview       URL pública
```

- `develop` es staging. Cada push genera un alias `develop-checkin-app.guiruamur.workers.dev`.
- `main` es producción. Cada push despliega a `checkin-app.guiruamur.workers.dev`.
- `feat/*` y `fix/*` van a `develop` vía PR. De ahí a `main` vía PR review.

## Documentación

- [Spec de diseño global](docs/superpowers/specs/2026-05-16-checkin-app-design.md)
- [Spec de M2 (agenda + eventos)](docs/superpowers/specs/2026-05-17-m2-agenda-eventos-design.md)
- [Plan M1 — Fundación](docs/superpowers/plans/2026-05-16-m1-fundacion.md)
- [Plan M2 Fase 0 — Prereqs](docs/superpowers/plans/2026-05-17-m2-phase-0-prereqs.md)

## Roadmap (milestones)

- **M1 — Fundación** ✅ (`v0.1.0-m1`): setup Vite/Supabase, schema con RLS, auth de admin, shell de panel
- **M2 — Agenda y eventos** (en curso):
  - **Fase 0 — Prereqs** ✅ (`v0.2.0-m2-phase0`): JWT claim, audit trigger, signup atómico
  - **Fase 1a — Workers backend** ✅ (`v0.3.0-m2-phase1a`): tabla workers, 4 Edge Functions, Resend integration, double opt-in
  - **Fase 1b — Workers frontend** (pendiente)
  - **Fase 2 — Clients** (pendiente)
  - **Fase 3 — Events + QR** (pendiente)
- **M3 — Check-in del trabajador**: flow `/e/:token`, JWT custom, check-in/out, geolocalización
- **M4 — Alertas y salida retrasada**: pg_cron, edge functions, Resend, formulario late-checkout
- **M5 — Reportes y dashboard live**: filtros + export Excel/PDF, Supabase Realtime, audit_log

## Licencia

Pendiente de definir.
