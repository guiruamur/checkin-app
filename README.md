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
# ...una por cada function que toque la rama
```

Si la rama añade un Supabase Auth Hook nuevo, también hay que **registrarlo a mano en el dashboard cloud**:

1. https://supabase.com/dashboard/project/ffvosnpfmdyabeeexmop/auth/hooks
2. Add hook → Custom Access Token → Postgres → schema `public` → función correspondiente → Enabled → Save.

Hooks activos hoy:
- `custom_access_token_hook` (inyecta `company_id` como claim JWT).

Edge Functions deployadas hoy:
- `signup-admin` (signup atómico admin + company + admin_user).

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
  - **Fase 1 — Workers / agenda** (pendiente)
  - **Fase 2 — Clients** (pendiente)
  - **Fase 3 — Events + QR** (pendiente)
- **M3 — Check-in del trabajador**: flow `/e/:token`, JWT custom, check-in/out, geolocalización
- **M4 — Alertas y salida retrasada**: pg_cron, edge functions, Resend, formulario late-checkout
- **M5 — Reportes y dashboard live**: filtros + export Excel/PDF, Supabase Realtime, audit_log

## Licencia

Pendiente de definir.
