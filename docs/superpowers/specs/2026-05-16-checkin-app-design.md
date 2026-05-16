# Check-in App — Diseño

**Fecha**: 2026-05-16
**Estado**: Spec aprobado, pendiente de plan de implementación
**Autor**: Germán (con asistencia de Claude)

## 1. Contexto y objetivo

Cliente: empresa de azafatos para eventos. Necesita una herramienta de **registro horario** para sus trabajadores que cumpla con el RD-Ley 8/2019 (registro obligatorio de jornada laboral en España, conservación 4 años).

Los trabajadores prestan servicio en eventos en **localizaciones cambiantes** (bodas, congresos, ferias…), por lo que el sistema no puede asumir un puesto físico fijo y debe poder fichar desde cualquier sitio con conexión.

El producto se diseña como **SaaS multi-tenant ligero**: el primer cliente es esta empresa, pero se prevé revender la solución a otras del mismo sector.

### Objetivos no funcionales

- **Coste arrancado**: 0 €/mes con free tiers (uso comercial permitido)
- **Despliegue continuo** y mantenimiento mínimo (sin VPS que parchear)
- **Mobile-first** para la web del trabajador (azafatos usan móvil personal en evento)
- **Una sola base de código** para todas las experiencias

### Fuera de alcance (v1)

- App nativa iOS/Android
- Múltiples roles de admin (operador, manager, etc.) — solo un rol "admin"
- Multi-idioma (solo español)
- Billing / facturación / onboarding self-service de nuevas empresas
- Plataforma de empleados con marcado de disponibilidad (futura iteración)

## 2. Stack tecnológico

| Capa | Tecnología |
|---|---|
| Frontend (SPA única) | Vite + React + TypeScript + Tailwind CSS |
| Hosting frontend | Cloudflare Pages (tier gratuito, uso comercial permitido) |
| Backend / DB / Auth | Supabase (Postgres + Auth + RLS + pg_cron + Edge Functions Deno) |
| Emails transaccionales | Resend (3.000/mes gratis) |
| Generación QR | `qrcode.react` |
| Autocomplete dirección | Nominatim / OpenStreetMap (sin coste) |

**Coste estimado**: 0 €/mes hasta agotar free tiers; ~25 €/mes (Supabase Pro) a partir de ~200 eventos/mes.

## 3. Arquitectura

```
┌────────────────────────────────────────────────────────────────┐
│                   Cloudflare Pages (SPA)                       │
│  ┌──────────────────────┐    ┌────────────────────────────┐   │
│  │  Web Trabajador      │    │  Web Admin (PWA)            │   │
│  │  /e/:token            │    │  /admin/*                   │   │
│  └──────────┬────────────┘    └──────────────┬─────────────┘   │
└─────────────┼──────────────────────────────────┼───────────────┘
              │  JWT custom                      │  Supabase Auth
              ▼                                  ▼
┌────────────────────────────────────────────────────────────────┐
│                         SUPABASE                                │
│  ┌────────────┐  ┌────────────┐  ┌──────────────────────────┐  │
│  │ Postgres   │  │ Auth       │  │ Edge Functions (Deno)    │  │
│  │ + RLS      │  │ (admins)   │  │ - issue-worker-jwt        │  │
│  │ + pg_cron  │  │            │  │ - event-by-token          │  │
│  └────────────┘  └────────────┘  │ - process-late-checkouts  │  │
│                                  │ - submit-late-checkout    │  │
│                                  └──────────────┬───────────┘  │
└──────────────────────────────────────────────────┼──────────────┘
                                                   ▼
                                          ┌────────────────┐
                                          │  Resend        │
                                          └────────────────┘
```

**Decisiones clave:**

- **Una sola SPA** que sirve dos experiencias según la ruta: `/e/:token` (trabajador) y `/admin/*` (panel).
- **Dos sistemas de auth distintos**:
  - Admin: Supabase Auth estándar (email + password).
  - Trabajador: NO tiene cuenta Supabase. Auth basada en (token de evento + selección de nombre + PIN). Una Edge Function valida y emite un JWT custom acotado al par (event_id, worker_id) con TTL 24h.
- **Multi-tenant ligero**: todas las tablas llevan `company_id`. Row Level Security garantiza aislamiento aunque el frontend tenga bugs.
- **Lógica de tareas programadas**: pg_cron cada minuto dispara la Edge Function que detecta check-outs pendientes y envía emails.

## 4. Modelo de datos

```
companies (tenant raíz)
├── id (uuid, PK)
├── name
├── slug (UNIQUE, usado en /candidato/registro?company=<slug>)
├── created_at

admin_users  (gestionado por Supabase Auth)
├── id (uuid, PK)  -- coincide con auth.users.id
├── company_id (FK)
├── email
├── full_name
├── created_at

workers  (la "agenda" del cliente)
├── id (uuid, PK)
├── company_id (FK)
├── email
├── phone  (los 4 últimos = PIN)
├── first_name
├── last_name
├── postal_code (nullable)
├── status (pending | approved | rejected | archived)
├── created_at
├── approved_at, approved_by (FK admin_users)
├── archived_at (soft delete)
└── UNIQUE (company_id, email)

clients
├── id (uuid, PK)
├── company_id (FK)
├── name
├── contact_email
├── created_at, archived_at

events
├── id (uuid, PK)
├── company_id (FK)
├── client_id (FK)
├── name
├── address
├── organizer_email
├── access_token (uuid, UNIQUE)  -- usado en QR/URL
├── starts_at, ends_at  -- rango informativo
├── created_at, archived_at

event_assignments  (trabajador asignado a evento, con su horario)
├── id (uuid, PK)
├── event_id (FK)
├── worker_id (FK)
├── scheduled_start, scheduled_end (timestamptz)
└── (sin UNIQUE: un trabajador puede tener varias asignaciones en el mismo evento para horario partido)

check_ins  (registro horario — corazón del sistema)
├── id (uuid, PK)
├── assignment_id (FK)
├── checked_in_at (timestamptz, NOT NULL)
├── check_in_lat, check_in_lng, check_in_accuracy_m (nullable)
├── checked_out_at (timestamptz, nullable mientras está abierto)
├── check_out_lat, check_out_lng, check_out_accuracy_m (nullable)
├── late_checkout_reported_at (timestamptz, nullable)
├── late_checkout_reason (text, nullable)
├── late_checkout_real_time (timestamptz, nullable)
├── client_ip (inet, para auditoría)
├── user_agent (text, para auditoría)

email_alerts_sent  (idempotencia de alertas)
├── id (uuid, PK)
├── check_in_id (FK)
├── alert_type ('late_20min' | 'late_12h')
├── sent_at
└── UNIQUE (check_in_id, alert_type)

audit_log
├── id (uuid, PK)
├── company_id (FK)
├── actor_id (FK admin_users)
├── action (text)  -- p.ej. 'worker.approved', 'check_in.edited'
├── entity_type, entity_id
├── diff (jsonb)  -- before/after
├── created_at
```

**Índices clave:**

- `check_ins (assignment_id) WHERE checked_out_at IS NULL` — índice parcial para el dashboard de fichados en tiempo real.
- `event_assignments (event_id, scheduled_start)` — para encontrar el "próximo turno" del trabajador.
- `events (access_token)` — lookup desde la URL pública.
- `workers (company_id, status)` — para la pestaña de pendientes.

**Soft delete y retención**: nada se borra realmente; se usa `archived_at`. Un job mensual de pg_cron purga registros >4 años. El derecho de supresión RGPD se respeta excepto para registros horarios dentro del periodo legal de 4 años (obligación legal prevalece).

## 5. Flujos de usuario

### Flujo A — Trabajador hace check-in

1. Escanea QR / abre enlace → SPA abre `/e/:token`.
2. SPA llama a Edge Function `event-by-token` → devuelve datos públicos del evento + lista de trabajadores asignados con turno pendiente hoy.
3. Pantalla "¿Quién eres?": buscador + lista alfabética de trabajadores.
4. Toca su nombre → modal "Introduce los 4 últimos dígitos de tu teléfono".
5. SPA llama a Edge Function `issue-worker-jwt` con (token, worker_id, pin). Valida y devuelve JWT acotado a `(event_id, worker_id)`, TTL 24h. Tras 3 fallos, bloqueo 5 min.
6. JWT en `localStorage` → pantalla "Tu turno hoy: HH:MM–HH:MM. ¿Hacer CHECK-IN ahora?".
7. Botón CHECK-IN → solicita geolocalización (no bloqueante). INSERT en `check_ins` con timestamp + coords (si hay) + IP + user-agent.
8. Vista "Estás fichado desde HH:MM. CHECK-OUT cuando termines".

### Flujo B — Trabajador hace check-out

- **Normal**: vuelve a abrir la web, JWT en `localStorage` le reconoce → botón CHECK-OUT.
- **Pérdida de sesión** (otro móvil, navegador limpio): vuelve a escanear QR → pasa por flujo A, pero la pantalla detecta check-in abierto y muestra "CHECK-OUT" en vez de "CHECK-IN".
- **Olvido**: a los +20 min del fin de turno recibe email con enlace al formulario de salida retrasada (sección 7).

### Flujo C — Admin crea un evento

1. `/admin/eventos/nuevo`.
2. Formulario: nombre, dirección (autocompletado Nominatim), cliente (dropdown buscable con "+ Nuevo cliente" inline), email organizador, fechas/horas globales.
3. Asignación de trabajadores: buscador sobre la agenda. Cada trabajador añadido genera una fila editable con `scheduled_start` y `scheduled_end`. Botón "duplicar" → segunda asignación (horario partido).
4. Al guardar: genera `access_token`, muestra QR + URL para copiar/imprimir/enviar al organizador.

### Flujo D — Admin aprueba candidatos

- `/admin/agenda` muestra trabajadores `approved` por defecto.
- Pestaña "Pendientes (N)" con los `pending`.
- Cada fila: "Aprobar" / "Rechazar". Aprobar registra `approved_by`, `approved_at` y emite `audit_log`.

### Flujo E — Candidato se registra

- URL pública `/candidato/registro?company=<slug>`.
- Formulario: nombre, apellido, email, teléfono, código postal.
- Validación: email único en esa empresa; teléfono mínimo 9 dígitos.
- INSERT en `workers` con `status='pending'`. Mensaje de gracias.

## 6. Seguridad

### Aislamiento entre empresas (RLS)

Todas las tablas tienen RLS activado. Política base:

```sql
CREATE POLICY tenant_isolation ON <tabla>
  USING (company_id = (auth.jwt() ->> 'company_id')::uuid);
```

El JWT del admin lleva `company_id` como claim custom, añadido en un trigger `on_auth_user_created`.

### Auth del trabajador (JWT custom)

Cadena de confianza: `access_token de evento` → `selección de nombre` → `PIN (4 últimos del teléfono)` → Edge Function `issue-worker-jwt` valida los tres y emite JWT firmado con la JWT secret de Supabase. El JWT contiene `{ worker_id, event_id, exp: 24h, role: 'worker' }`. RLS de `check_ins` acepta INSERT/UPDATE solo si `assignment_id` pertenece a ese `(event_id, worker_id)`.

### Riesgos asumidos

| Riesgo | Mitigación |
|---|---|
| Suplantación entre compañeros que conocen el teléfono | Asumido — modelo de confianza. `audit_log` con IP/UA permite disputa. |
| Brute-force del PIN (10.000 combinaciones) | Rate limit: 3 intentos / 5 min por `(event_id, worker_id)`. Backoff exponencial tras 10 fallos. |
| Filtración del token del evento | El token solo da acceso a la lista de trabajadores asignados, no permite fichar sin PIN. Token expira a `ends_at + 24h`. |
| Fichaje desde casa | Geolocalización opcional registrada; admin lo ve y decide. No bloqueante por decisión de producto. |

### RGPD y datos personales

- Teléfono: dato personal protegido por RLS; accesible solo desde Edge Functions con `service_role` y desde el admin de la propia empresa. No se expone nunca al cliente público.
- Geolocalización: dato sensible. Aviso explícito al trabajador antes de pedir permiso.
- Email: necesario para alertas. Informado en el registro del candidato.
- Retención: 4 años desde el último check-in. Purga mensual automática vía `pg_cron`.
- HTTPS obligatorio (Cloudflare), CORS restrictivo en Edge Functions, CSP headers desde Cloudflare Pages.

## 7. Alertas, reportes y dashboard

### Alertas automáticas

Edge Function `process-late-checkouts`, disparada cada minuto por `pg_cron`. Hace dos queries en serie:

1. **+20 min sin checkout**: busca check-ins abiertos donde `scheduled_end + interval '20 minutes' < now()` y no exista en `email_alerts_sent` con `alert_type='late_20min'`. Por cada uno: enviar email al trabajador con enlace al formulario de salida retrasada, INSERT en `email_alerts_sent`.

2. **+12 h sin checkout**: misma query con `interval '12 hours'` y `alert_type='late_12h'`. Email al trabajador con tono más urgente.

Idempotencia garantizada por el UNIQUE de `email_alerts_sent (check_in_id, alert_type)`.

### Formulario de salida retrasada

Ruta `/late-checkout/:token`. El token es un JWT firmado, embebido en el email, que identifica el `check_in_id`.

- Muestra: nombre del evento, hora de entrada, "no hiciste check-out".
- Inputs: hora real de salida (datetime picker) + motivo (textarea).
- Al enviar (vía Edge Function `submit-late-checkout`): UPDATE de `check_ins` con `late_checkout_real_time`, `late_checkout_reason`, `late_checkout_reported_at` y `checked_out_at = late_checkout_real_time`.
- Admin ve estos check-ins marcados con ⚠️ "salida reportada manualmente".

### Reportes

`/admin/reportes`:

- **Filtros**: rango de fechas, trabajador (multi-select), evento (multi-select), cliente.
- **Tabla**: fila por check-in cerrado. Columnas: trabajador, evento, cliente, fecha, hora entrada, hora salida, horas totales, marca de salida reportada, enlaces a Google Maps para las coords.
- **Exportar**: `.xlsx` para nómina; PDF para Inspección de Trabajo con totales por trabajador y rango.

### Dashboard live

`/admin` (home):

- **Ahora mismo fichados**: trabajadores con check-in abierto, desde cuándo, en qué evento.
- **Eventos de hoy**: próximos eventos del día con esperados / fichados.
- **Pendientes de aprobación**: contador con enlace.

Actualización en vivo con Supabase Realtime (sin polling).

### Auditoría

Cualquier mutación del admin (aprobar/rechazar trabajador, crear/editar evento, editar check-in) inserta una fila en `audit_log` con diff before/after. Vista `/admin/auditoria` para consulta.

## 8. Estructura del repositorio

Monorepo plano (un solo `package.json`, sin workspaces). Cuando aparezca un segundo "app" (mobile nativa, landing separada…) se promueve a workspaces.

```
checkin-app/
├── src/                          # Vite + React SPA
│   ├── routes/
│   │   ├── event/                # /e/:token (trabajador)
│   │   ├── late-checkout/
│   │   ├── candidato/
│   │   └── admin/
│   ├── lib/
│   │   ├── supabase.ts           # cliente Supabase
│   │   └── workerJwt.ts
│   ├── components/
│   └── types/
│       └── database.ts           # generado con `supabase gen types typescript`
├── supabase/
│   ├── migrations/               # SQL versionado
│   ├── functions/
│   │   ├── event-by-token/
│   │   ├── issue-worker-jwt/
│   │   ├── process-late-checkouts/
│   │   └── submit-late-checkout/
│   └── config.toml
├── docs/
│   └── superpowers/
│       └── specs/
│           └── 2026-05-16-checkin-app-design.md   ← este documento
├── public/
├── package.json
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── README.md
```

## 9. Criterios de aceptación (v1)

- [ ] Admin puede crear empresa, loguearse, gestionar agenda (aprobar candidatos), clientes y eventos.
- [ ] Candidato puede auto-registrarse desde URL pública y queda pendiente.
- [ ] Trabajador puede hacer check-in desde QR/enlace, con PIN, opcionalmente con geolocalización.
- [ ] Trabajador puede hacer check-out (vía sesión persistente o re-escaneando QR).
- [ ] Sistema envía email a los +20 min y +12 h sin check-out.
- [ ] Trabajador puede rellenar el formulario de salida retrasada.
- [ ] Admin ve dashboard con fichados activos en tiempo real.
- [ ] Admin puede exportar reportes en Excel y PDF.
- [ ] RLS impide acceso cruzado entre empresas (verificable con tests).
- [ ] Rate limit del PIN funciona (verificable con tests).
- [ ] Audit log se rellena en todas las mutaciones del admin.
