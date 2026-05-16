# Checkin App

App web SaaS de **registro horario** para empresas de azafatos para eventos, conforme a la RD-Ley 8/2019 (España).

Estado actual: **fase de diseño y planificación**. Implementación pendiente.

## Resumen

- Web para que los trabajadores hagan check-in/out desde su móvil, fichando vía QR de evento + PIN.
- Panel admin (PWA) para gestionar agenda de trabajadores, clientes, eventos y reportes.
- Multi-tenant: un mismo despliegue sirve a varias empresas aisladas con Row Level Security.

## Stack

- **Frontend**: Vite + React + TypeScript + Tailwind CSS, desplegado en Cloudflare Pages
- **Backend**: Supabase (Postgres + Auth + RLS + pg_cron + Edge Functions en Deno)
- **Emails**: Resend
- **Tests**: Vitest + React Testing Library + pgTAP

## Documentación

- [Spec de diseño](docs/superpowers/specs/2026-05-16-checkin-app-design.md)
- [Plan M1 — Fundación](docs/superpowers/plans/2026-05-16-m1-fundacion.md)

## Roadmap (milestones)

- **M1 — Fundación**: setup Vite/Supabase, schema con RLS, auth de admin, shell de panel
- **M2 — Agenda y eventos**: registro de candidatos, aprobación, CRUD clientes/eventos con asignaciones, QR
- **M3 — Check-in del trabajador**: flow `/e/:token`, JWT custom, check-in/out, geolocalización
- **M4 — Alertas y salida retrasada**: pg_cron, edge functions, Resend, formulario late-checkout
- **M5 — Reportes y dashboard live**: filtros + export Excel/PDF, Supabase Realtime, audit_log

## Licencia

Pendiente de definir.
