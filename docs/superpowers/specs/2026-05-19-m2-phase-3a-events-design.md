# M2 Fase 3a — Eventos + asignaciones + QR: Diseño

**Fecha**: 2026-05-19
**Estado**: Spec aprobado, pendiente de plan de implementación
**Predecesores**:
- `2026-05-16-checkin-app-design.md` (spec maestro)
- `2026-05-17-m2-agenda-eventos-design.md` (spec M2 global)
- `2026-05-19-m2-phase-2-clients-design.md` (patrón CRUD + column default a replicar)

## 1. Contexto y objetivo

Fase 3 (eventos) se divide en dos sub-fases por su distinto perfil de riesgo:

- **3a (esta spec)**: gestión de eventos y asignaciones de trabajadores + QR. Todo frontend + DB, reutilizando patrones ya probados en producción (CRUD supabase-js, RLS por claim JWT, column default de company_id, audit trigger, form en modal). Única novedad: `qrcode.react` (client-side, sin backend).
- **3b (spec aparte)**: envío de confirmación al organizador — Edge Function `send-event-confirmation` con PDF (`pdf-lib`) + QR server-side + email Resend con adjunto. Es la parte integración-pesada y novedosa; se aísla para que su complejidad no bloquee la gestión de eventos.

Al cerrar 3a: un admin puede crear eventos, asignarles trabajadores aprobados (con horarios individuales y horario partido), ver el QR del evento, y archivar/restaurar. El envío de confirmación llega en 3b.

### Decisión estructural clave (diverge del spec global)

El spec global describía un form single-page con datos del evento + asignaciones en un solo submit. **3a usa "crear primero, asignar después"**: el alta pide solo datos del evento; las asignaciones se gestionan en la página de detalle. Razones:
- Coincide con el flujo real: reservas el evento al cerrar con el cliente, asignas personal según confirman.
- Form de alta simple; cada pieza (evento, asignaciones) es testeable por separado.
- El detalle es necesario igualmente para editar asignaciones más tarde, así que no se duplica trabajo.

### Decisiones cerradas en brainstorm

- **Descomposición**: 3a (eventos+asignaciones+QR) / 3b (confirmación email+PDF).
- **Asignaciones**: crear evento primero, asignar en el detalle.
- **Form de evento**: modal (consistente con clientes), sirve para alta y edición de datos.
- **Selección de cliente**: dropdown de clientes activos. `organizer_email` se pre-rellena del cliente seleccionado, editable. **Diferido** el "+Nuevo cliente" inline (YAGNI; se crea en /admin/clientes).
- **Dirección**: texto libre. **Diferido** autocompletado Nominatim.
- **Fechas**: `<input type="datetime-local">` nativo, sin librería.
- **Bulk-apply de horarios**: **diferido**. Añadir un worker usa por defecto el horario del evento; editar individual + duplicar fila cubre el core.
- **Listado**: tabs de filtro (Próximos default / Pasados / Archivados), búsqueda client-side por nombre.
- **Archivar + restaurar**: sí (consistente con clientes).
- **company_id**: column default `(auth.jwt() ->> 'company_id')::uuid` + RLS WITH CHECK (patrón de clientes).

### Fuera de alcance (a 3b o posterior)

- Botón "Enviar confirmación" + Edge Function `send-event-confirmation` + PDF + email → **3b**.
- "+Nuevo cliente" inline desde el form de evento.
- Autocompletado de dirección (Nominatim).
- Bulk-apply de horarios a varios asignados a la vez.
- Ruta de check-in del trabajador `/e/:token` → **M3** (el QR ya la codifica).

## 2. Modelo de datos

Migración nueva (las tablas no existen todavía). La función `log_audit_event` (Fase 0) ya soporta `event_assignments` (resuelve company_id vía el evento padre y tiene guard para cascade-delete) — solo hay que adjuntar triggers.

```sql
-- EVENTS
create table public.events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default (auth.jwt() ->> 'company_id')::uuid
    references public.companies (id) on delete cascade,
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

alter table public.events enable row level security;

create policy events_tenant on public.events
  for all to authenticated
  using (company_id = (auth.jwt() ->> 'company_id')::uuid)
  with check (company_id = (auth.jwt() ->> 'company_id')::uuid);

create trigger events_audit
  after insert or update or delete on public.events
  for each row execute function public.log_audit_event();

-- EVENT_ASSIGNMENTS (sin company_id propio; RLS via evento padre)
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

alter table public.event_assignments enable row level security;

create policy event_assignments_tenant on public.event_assignments
  for all to authenticated
  using (exists (
    select 1 from public.events e
    where e.id = event_assignments.event_id
      and e.company_id = (auth.jwt() ->> 'company_id')::uuid
  ))
  with check (exists (
    select 1 from public.events e
    where e.id = event_assignments.event_id
      and e.company_id = (auth.jwt() ->> 'company_id')::uuid
  ));

create trigger event_assignments_audit
  after insert or update or delete on public.event_assignments
  for each row execute function public.log_audit_event();
```

### Notas sobre el modelo

- **`events.company_id` default + WITH CHECK**: mismo patrón que clients. El INSERT viene del SPA autenticado; el default rellena el tenant, el WITH CHECK lo blinda.
- **`client_id ON DELETE RESTRICT`**: no se puede borrar un cliente con eventos (debe archivarse; sus eventos siguen referenciándolo).
- **`worker_id ON DELETE RESTRICT`**: no se puede borrar un worker con asignaciones. Soft delete vía archivado.
- **`access_token` UUID v4 único, server-side**: 122 bits de entropía, no adivinable. Para el QR (`/e/<token>`, ruta de M3).
- **Sin UNIQUE en `(event_id, worker_id)`**: permite explícitamente horario partido (misma persona, varias filas en el mismo evento).
- **`event_assignments` sin `company_id`**: RLS y audit lo resuelven vía el evento padre. WITH CHECK en INSERT verifica que el `event_id` pertenece a un evento del tenant.
- **`last_confirmation_sent_at`**: columna presente desde 3a pero solo la escribe 3b. En 3a queda siempre NULL.

## 3. Rutas y estructura frontend

```
src/
├── features/eventos/
│   ├── types.ts                  ← Event, EventWithClient, EventAssignment,
│   │                               AssignmentWithWorker, EventInput
│   ├── dates.ts                  ← toLocalInput(iso) / toISO(local) helpers
│   ├── api.ts                    ← eventos, asignaciones, selects (clientes/workers)
│   ├── EventosList.tsx           ← tabs filtro + búsqueda + "+ Nuevo evento" (modal)
│   ├── EventoForm.tsx            ← form RHF+Zod en modal (alta + edición de datos)
│   ├── EventoDetalle.tsx         ← página detalle: datos + Editar + QR + asignaciones
│   ├── AsignacionesSection.tsx   ← buscador workers + tabla asignados + add/edit/dup/remove
│   └── EventoQR.tsx              ← wrapper qrcode.react
├── routes/admin/
│   ├── eventos.tsx               ← refactor → <EventosList/>
│   └── evento-detalle.tsx        ← NEW → <EventoDetalle/> (lee :id de useParams)
└── App.tsx                       ← añadir ruta hija "eventos/:id"
```

**Rutas:**
- `/admin/eventos` → listado.
- `/admin/eventos/:id` → detalle.

**Dependencia nueva:** `qrcode.react` (client-side). Instalar en la primera tarea.

**`database.ts`:** añadir tablas `events` y `event_assignments` manualmente (igual que workers/clients; regen formal al cierre de M2).

## 4. Capa API

`features/eventos/api.ts` — wrappers supabase-js directos, lanzan `Error` en fallo (patrón de clientes).

```ts
import { supabase } from '../../lib/supabase';
import type { Event, EventWithClient, AssignmentWithWorker } from './types';

export type EventInput = {
  client_id: string;
  name: string;
  address: string;
  organizer_email: string;
  starts_at: string;  // ISO
  ends_at: string;    // ISO
};

// --- Eventos ---
export async function listEvents(): Promise<EventWithClient[]>;          // join client(name); order starts_at asc
export async function getEvent(id: string): Promise<EventWithClient | null>;
export async function createEvent(input: EventInput): Promise<string>;   // devuelve id (para navegar al detalle)
export async function updateEvent(id: string, input: EventInput): Promise<void>;
export async function archiveEvent(id: string): Promise<void>;           // archived_at = now()
export async function restoreEvent(id: string): Promise<void>;           // archived_at = null

// --- Selects del form ---
export async function listActiveClients(): Promise<{ id: string; name: string; contact_email: string }[]>;
export async function listApprovedWorkers(): Promise<{ id: string; first_name: string; last_name: string }[]>;

// --- Asignaciones ---
export async function listAssignments(eventId: string): Promise<AssignmentWithWorker[]>;  // join worker(first_name,last_name)
export async function addAssignment(eventId: string, workerId: string, start: string, end: string): Promise<void>;
export async function updateAssignment(id: string, start: string, end: string): Promise<void>;
export async function removeAssignment(id: string): Promise<void>;
```

- `createEvent` no envía `company_id` (column default). Hace `insert(...).select('id').single()` y devuelve el id.
- `listEvents`/`getEvent` traen el nombre del cliente con un join PostgREST (`select('*, clients(name)')`).
- `listApprovedWorkers`: `status='approved' AND archived_at IS NULL`.
- `listActiveClients`: `archived_at IS NULL`.

**Helpers de fecha (`dates.ts`):**
```ts
// ISO (UTC) → valor para <input type="datetime-local"> (local, sin zona, "YYYY-MM-DDTHH:mm")
export function toLocalInput(iso: string): string;
// valor de datetime-local → ISO (UTC)
export function toISO(local: string): string;
```

## 5. Componentes y flujo

### 5.1 `EventoForm` (modal, alta + edición)

RHF + Zod. Campos: `client_id` (select de clientes activos), `name`, `address`, `organizer_email`, `starts_at`, `ends_at` (datetime-local).

**Schema:**
```ts
const schema = z.object({
  client_id: z.string().min(1, 'Selecciona un cliente'),
  name: z.string().min(1, 'Obligatorio'),
  address: z.string().min(1, 'Obligatorio'),
  organizer_email: z.string().min(1, 'Obligatorio').email('Email inválido'),
  starts_at: z.string().min(1, 'Obligatorio'),
  ends_at: z.string().min(1, 'Obligatorio'),
}).refine((d) => d.ends_at > d.starts_at, { message: 'El fin debe ser posterior al inicio', path: ['ends_at'] });
```
(`datetime-local` da strings comparables lexicográficamente, así que `>` funciona para la validación.)

Al seleccionar un cliente, `organizer_email` se autorrellena con su `contact_email` si el campo está vacío (no pisa lo que el admin haya escrito). Al submit, las fechas se convierten a ISO con `toISO`.

### 5.2 `EventosList`

- Carga `listEvents()` en mount.
- Tabs: **Próximos** (`starts_at >= now` y no archivado, default), **Pasados** (`starts_at < now` y no archivado), **Archivados** (`archived_at IS NOT NULL`).
- Orden: `listEvents` trae ascendente por `starts_at`. Próximos se muestra tal cual (el más cercano primero); Pasados se invierte client-side (el más reciente primero); Archivados orden ascendente por defecto.
- Búsqueda client-side por nombre del evento.
- Tabla: Nombre, Cliente, Fecha inicio, Estado/acciones. Click en una fila (o botón "Ver") → navega a `/admin/eventos/:id`.
- "+ Nuevo evento" → modal `EventoForm` vacío; al crear → `navigate('/admin/eventos/' + id)`.
- Archivar (confirm) / Restaurar (en tab Archivados) → refetch.
- Banner de error.

### 5.3 `EventoDetalle` (`/admin/eventos/:id`)

- Lee `:id` de `useParams`, carga `getEvent(id)`.
- Si no existe → "Evento no encontrado".
- Muestra datos del evento + nombre del cliente. Botón **Editar** → modal `EventoForm` prefilled.
- `EventoQR` con la URL del token.
- `AsignacionesSection` (sección de la misma página).
- Botón Archivar.

### 5.4 `AsignacionesSection`

- Props: `eventId`, `eventStart`, `eventEnd` (para horario por defecto).
- Carga `listAssignments(eventId)`.
- **Buscador**: input que filtra `listApprovedWorkers()` client-side por nombre; click en un resultado → `addAssignment(eventId, workerId, eventStart, eventEnd)` → refetch.
- **Tabla de asignados**: por fila → nombre del worker + `scheduled_start` + `scheduled_end` (inputs `datetime-local`; al cambiar → `updateAssignment`) + **Duplicar** (añade otra fila idéntica → horario partido) + **Quitar** (confirm → `removeAssignment`).
- Mismo worker puede aparecer en varias filas (sin restricción).
- Empty state si no hay asignados.

### 5.5 `EventoQR`

- `qrcode.react` (`QRCodeSVG`). Encodea `${baseUrl}/e/${accessToken}` donde `baseUrl = import.meta.env.VITE_SITE_URL ?? window.location.origin`.
- Debajo, la URL en texto seleccionable.

## 6. Testing

### 6.1 Frontend (Vitest + RTL)

- `features/eventos/dates.test.ts` — `toLocalInput`/`toISO` roundtrip y casos de zona.
- `features/eventos/api.test.ts` — wrappers (eventos, asignaciones, selects) llaman a supabase-js con args correctos y propagan errores; mocks de supabase.
- `features/eventos/EventoForm.test.tsx` — validación (requeridos, email, ends>starts), autorrelleno de organizer_email al elegir cliente, modo edición prefilla, submit convierte a ISO.
- `features/eventos/EventosList.test.tsx` — tabs filtran (próximos/pasados/archivados), búsqueda, abrir modal de alta + navegación al crear, archivar/restaurar, banner error.
- `features/eventos/EventoDetalle.test.tsx` — carga evento, "no encontrado", render QR, abrir modal de edición.
- `features/eventos/AsignacionesSection.test.tsx` — buscar+añadir worker (horario por defecto), editar horario, duplicar (horario partido), quitar con confirm, empty state.
- `features/eventos/EventoQR.test.tsx` — render con la URL correcta del token.

### 6.2 pgTAP

- `events_rls.sql` — aislamiento tenant + WITH CHECK rechaza company_id ajeno.
- `events_company_default.sql` — default rellena company_id del claim al insertar sin él.
- `event_assignments_rls.sql` — admin A no ve ni inserta asignaciones de eventos de B (RLS vía evento padre).
- `event_assignments_split_shift.sql` — dos asignaciones del mismo worker en el mismo evento son válidas.
- `events_audit_attached.sql` — INSERT/UPDATE/DELETE en events → audit con action `events.*`.
- `event_assignments_audit_attached.sql` — mutaciones en event_assignments → audit con company_id resuelto vía evento padre.

### 6.3 Smoke E2E manual (pre-merge a main)

1. Crear evento (elegir cliente, comprobar autorrelleno de organizer_email, fechas) → navega al detalle.
2. Validación: fin antes que inicio, email inválido, campos vacíos → errores inline.
3. Detalle: QR visible, URL bajo el QR contiene el access_token.
4. Añadir 3 workers aprobados → aparecen con el horario del evento.
5. Editar el horario de uno → persiste.
6. Duplicar uno → dos filas del mismo worker (horario partido); ponerles horas distintas.
7. Quitar uno (confirm) → desaparece.
8. Editar datos del evento (modal) → persiste; el QR no cambia (mismo token).
9. Listado: tabs Próximos/Pasados/Archivados filtran bien; búsqueda por nombre.
10. Archivar evento → va a Archivados; Restaurar → vuelve.
11. Cross-tenant: admin de otra empresa no ve estos eventos ni sus asignaciones.

## 7. Criterios de aceptación

- [ ] Migración `events` + `event_assignments` en cloud con RLS, WITH CHECK, default de company_id, índices, audit triggers.
- [ ] `/admin/eventos` lista eventos con tabs Próximos/Pasados/Archivados y búsqueda por nombre.
- [ ] "+ Nuevo evento" abre modal; alta válida crea el evento y navega a su detalle.
- [ ] Validación inline: cliente/nombre/dirección/email/fechas; `ends_at > starts_at`.
- [ ] `organizer_email` se autorrellena del cliente elegido (sin pisar edición manual).
- [ ] Detalle muestra datos + nombre de cliente + QR (URL con access_token) + sección de asignaciones.
- [ ] Editar datos del evento desde el detalle (modal) persiste.
- [ ] Añadir worker aprobado a un evento usa por defecto el horario del evento.
- [ ] Editar horario de una asignación persiste.
- [ ] Duplicar asignación crea otra fila del mismo worker (horario partido).
- [ ] Quitar asignación (confirm) la elimina.
- [ ] Archivar/restaurar evento funciona; tabs reflejan el estado.
- [ ] Aislamiento cross-tenant (pgTAP + smoke) en events y event_assignments.
- [ ] Horario partido válido a nivel DB (sin UNIQUE) verificado en pgTAP.
- [ ] Audit log poblado en mutaciones de events y event_assignments.
- [ ] Tests Vitest + pgTAP verdes.
- [ ] Smoke E2E manual completo contra preview, luego producción.

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| `event_assignments` audit falla si company_id no resuelve | La función `log_audit_event` ya tiene el branch + guard de cascade (Fase 0/1a). Verificado en el código de la migración existente. |
| Zonas horarias: `datetime-local` es local, la DB guarda timestamptz UTC | Helpers `toISO`/`toLocalInput` centralizan la conversión; tests de roundtrip en `dates.test.ts`. |
| Comparar `ends_at > starts_at` con strings de datetime-local | El formato `YYYY-MM-DDTHH:mm` es lexicográficamente ordenable, así que `>` sobre strings funciona para la validación de cliente; la DB tiene el `check` como red de seguridad. |
| `client_id ON DELETE RESTRICT` bloquea borrar cliente con eventos | Intencional. En clientes solo hay archivar (soft delete), nunca DELETE, así que no se da el caso en la práctica. |
| QR apunta a `/e/:token` que aún no existe (M3) | Aceptado: el QR codifica la URL futura para que los QR ya impresos sean válidos cuando M3 implemente el check-in. |
| `database.ts` sin las tablas rompe el build | Añadir `events` y `event_assignments` manualmente en la primera tarea (patrón validado con workers/clients). |

## 9. No-objetivos explícitos

- No implementar el envío de confirmación (Edge Function, PDF, email) — es 3b.
- No implementar la ruta `/e/:token` — es M3.
- No `+Nuevo cliente` inline, ni Nominatim, ni bulk-apply de horarios.
- No tocar features de workers/clientes salvo leerlas (selects).
- No introducir librerías de date-picker, estado global, ni UI kit.
