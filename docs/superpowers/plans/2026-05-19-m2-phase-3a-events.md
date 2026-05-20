# M2 Fase 3a — Eventos + asignaciones + QR: Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gestión de eventos y asignaciones de trabajadores con QR client-side: crear/editar/archivar/restaurar eventos, asignar trabajadores aprobados con horarios individuales y horario partido, y mostrar el QR del evento.

**Architecture:** Tablas `events` + `event_assignments` con `company_id` por column default desde el claim JWT + RLS `WITH CHECK` (events) y RLS vía evento padre (event_assignments). Frontend en `features/eventos/` (patrón de `features/clientes/`): API supabase-js directa, listado con tabs de filtro, form de evento en modal, página de detalle con QR y sección de asignaciones. Flujo "crear primero, asignar después". Sin Edge Functions (eso es 3b).

**Tech Stack:** React 19 + Vite + TS + React Router v7 + RHF + Zod + Tailwind v3 + supabase-js + `qrcode.react` + Vitest + RTL + pgTAP.

**Spec:** `docs/superpowers/specs/2026-05-19-m2-phase-3a-events-design.md`

---

### Task 1: Migración + tipos + database.ts + dep qrcode.react

**Files:**
- Create: `supabase/migrations/20260519130000_events.sql`
- Create: `src/features/eventos/types.ts`
- Modify: `src/types/database.ts`
- Modify: `package.json` (dep `qrcode.react`)

- [ ] **Step 1: Instalar `qrcode.react`**

Run: `npm install qrcode.react`
Expected: se añade a `dependencies` en package.json.

- [ ] **Step 2: Crear `supabase/migrations/20260519130000_events.sql`**

```sql
-- Fase 3a: tablas events + event_assignments.
--
-- events: company_id por default del claim JWT + RLS WITH CHECK (mismo patron
--   que clients, INSERT viene del SPA autenticado).
-- event_assignments: sin company_id propio; RLS y audit lo resuelven via el
--   evento padre. La funcion log_audit_event (Fase 0) ya soporta esta tabla.
-- Sin UNIQUE en (event_id, worker_id) -> permite horario partido.

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

- [ ] **Step 3: Crear `src/features/eventos/types.ts`**

```ts
export type Event = {
  id: string;
  company_id: string;
  client_id: string;
  name: string;
  address: string;
  organizer_email: string;
  access_token: string;
  starts_at: string;
  ends_at: string;
  last_confirmation_sent_at: string | null;
  created_at: string;
  archived_at: string | null;
};

// listEvents / getEvent traen el nombre del cliente con un join PostgREST.
export type EventWithClient = Event & {
  clients: { name: string } | null;
};

export type EventAssignment = {
  id: string;
  event_id: string;
  worker_id: string;
  scheduled_start: string;
  scheduled_end: string;
  created_at: string;
};

export type AssignmentWithWorker = EventAssignment & {
  workers: { first_name: string; last_name: string } | null;
};
```

- [ ] **Step 4: Añadir `events` y `event_assignments` a `src/types/database.ts`**

Localiza el bloque `clients: { ... }` dentro de `public: { Tables: { ... } }` (añadido en Fase 2). Justo después de su cierre `}` (y antes del `}` que cierra `Tables`), inserta:

```ts
      events: {
        Row: {
          id: string
          company_id: string
          client_id: string
          name: string
          address: string
          organizer_email: string
          access_token: string
          starts_at: string
          ends_at: string
          last_confirmation_sent_at: string | null
          created_at: string
          archived_at: string | null
        }
        Insert: {
          id?: string
          company_id?: string
          client_id: string
          name: string
          address: string
          organizer_email: string
          access_token?: string
          starts_at: string
          ends_at: string
          last_confirmation_sent_at?: string | null
          created_at?: string
          archived_at?: string | null
        }
        Update: {
          id?: string
          company_id?: string
          client_id?: string
          name?: string
          address?: string
          organizer_email?: string
          access_token?: string
          starts_at?: string
          ends_at?: string
          last_confirmation_sent_at?: string | null
          created_at?: string
          archived_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      event_assignments: {
        Row: {
          id: string
          event_id: string
          worker_id: string
          scheduled_start: string
          scheduled_end: string
          created_at: string
        }
        Insert: {
          id?: string
          event_id: string
          worker_id: string
          scheduled_start: string
          scheduled_end: string
          created_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          worker_id?: string
          scheduled_start?: string
          scheduled_end?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_assignments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_assignments_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
```

Respeta la indentación existente (2 espacios). `company_id` es opcional en `events.Insert` (column default).

- [ ] **Step 5: Verificar el build**

Run: `npm run build`
Expected: build OK.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260519130000_events.sql src/features/eventos/types.ts src/types/database.ts package.json package-lock.json
git commit -m "feat(events): migracion events + event_assignments + tipos + qrcode.react"
```

NOTE: NO `Co-Authored-By` trailer.

---

### Task 2: Helpers de fecha `dates.ts`

**Files:**
- Create: `src/features/eventos/dates.ts`
- Test: `src/features/eventos/dates.test.ts`

- [ ] **Step 1: Escribir el test primero `src/features/eventos/dates.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { toLocalInput, toISO } from './dates';

describe('dates helpers', () => {
  it('roundtrips local -> ISO -> local (timezone-independent)', () => {
    const local = '2026-05-20T10:30';
    expect(toLocalInput(toISO(local))).toBe(local);
  });

  it('toISO produces a UTC ISO string ending in Z', () => {
    expect(toISO('2026-05-20T10:30')).toMatch(/Z$/);
  });

  it('toLocalInput formats to YYYY-MM-DDTHH:mm (16 chars, no seconds)', () => {
    const out = toLocalInput(toISO('2026-01-05T09:05'));
    expect(out).toBe('2026-01-05T09:05');
    expect(out).toHaveLength(16);
  });
});
```

- [ ] **Step 2: Correr el test (debe fallar)**

Run: `npm run test:run -- src/features/eventos/dates.test.ts`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implementar `src/features/eventos/dates.ts`**

```ts
// Conversión entre ISO (UTC, como guarda la DB) y el valor de
// <input type="datetime-local"> (hora LOCAL, formato "YYYY-MM-DDTHH:mm").

const pad = (n: number): string => String(n).padStart(2, '0');

// ISO (UTC) -> "YYYY-MM-DDTHH:mm" en hora local del navegador.
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// "YYYY-MM-DDTHH:mm" (local) -> ISO UTC. new Date(local) interpreta el
// string sin zona como hora local; toISOString lo pasa a UTC.
export function toISO(local: string): string {
  return new Date(local).toISOString();
}
```

- [ ] **Step 4: Correr el test (debe pasar)**

Run: `npm run test:run -- src/features/eventos/dates.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/eventos/dates.ts src/features/eventos/dates.test.ts
git commit -m "feat(events): helpers de conversion datetime-local <-> ISO"
```

NOTE: NO `Co-Authored-By` trailer.

---

### Task 3: Capa API `api.ts`

**Files:**
- Create: `src/features/eventos/api.ts`
- Test: `src/features/eventos/api.test.ts`

- [ ] **Step 1: Escribir el test primero `src/features/eventos/api.test.ts`**

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));

vi.mock('../../lib/supabase', () => ({
  supabase: { from: mockFrom },
}));

import {
  listEvents, getEvent, createEvent, updateEvent, archiveEvent, restoreEvent,
  listActiveClients, listApprovedWorkers,
  listAssignments, addAssignment, updateAssignment, removeAssignment,
} from './api';

// Query chainable: cada metodo devuelve el mismo objeto; es thenable para
// resolver en await, y .single/.maybeSingle resuelven el result.
function makeQuery(result: { data: unknown; error: unknown }) {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'insert', 'update', 'eq', 'is', 'order']) {
    q[m] = vi.fn(() => q);
  }
  q.single = vi.fn(() => Promise.resolve(result));
  q.maybeSingle = vi.fn(() => Promise.resolve(result));
  q.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return q;
}

beforeEach(() => {
  mockFrom.mockReset();
});

describe('listEvents', () => {
  it('selects events with client join ordered by starts_at asc', async () => {
    const q = makeQuery({ data: [{ id: 'e1', name: 'Boda', clients: { name: 'Bodega X' } }], error: null });
    mockFrom.mockReturnValue(q);
    const r = await listEvents();
    expect(mockFrom).toHaveBeenCalledWith('events');
    expect(q.select).toHaveBeenCalledWith('*, clients(name)');
    expect(q.order).toHaveBeenCalledWith('starts_at', { ascending: true });
    expect(r).toEqual([{ id: 'e1', name: 'Boda', clients: { name: 'Bodega X' } }]);
  });
  it('throws on error', async () => {
    mockFrom.mockReturnValue(makeQuery({ data: null, error: { message: 'rls' } }));
    await expect(listEvents()).rejects.toThrow('rls');
  });
});

describe('getEvent', () => {
  it('returns single event with client join', async () => {
    const q = makeQuery({ data: { id: 'e1', clients: { name: 'X' } }, error: null });
    mockFrom.mockReturnValue(q);
    const r = await getEvent('e1');
    expect(q.eq).toHaveBeenCalledWith('id', 'e1');
    expect(r).toEqual({ id: 'e1', clients: { name: 'X' } });
  });
  it('returns null when not found', async () => {
    mockFrom.mockReturnValue(makeQuery({ data: null, error: null }));
    expect(await getEvent('nope')).toBeNull();
  });
});

describe('createEvent', () => {
  it('inserts and returns the new id', async () => {
    const q = makeQuery({ data: { id: 'new-id' }, error: null });
    mockFrom.mockReturnValue(q);
    const input = {
      client_id: 'c1', name: 'Boda', address: 'Calle 1',
      organizer_email: 'o@x.com', starts_at: '2026-05-20T08:00:00.000Z', ends_at: '2026-05-20T20:00:00.000Z',
    };
    const id = await createEvent(input);
    expect(q.insert).toHaveBeenCalledWith(input);
    expect(q.select).toHaveBeenCalledWith('id');
    expect(id).toBe('new-id');
  });
  it('throws on error', async () => {
    mockFrom.mockReturnValue(makeQuery({ data: null, error: { message: 'check' } }));
    await expect(createEvent({
      client_id: 'c1', name: 'B', address: 'A', organizer_email: 'o@x.com',
      starts_at: 'x', ends_at: 'y',
    })).rejects.toThrow('check');
  });
});

describe('updateEvent / archiveEvent / restoreEvent', () => {
  it('updateEvent updates by id', async () => {
    const q = makeQuery({ data: null, error: null });
    mockFrom.mockReturnValue(q);
    await updateEvent('e1', {
      client_id: 'c1', name: 'B', address: 'A', organizer_email: 'o@x.com', starts_at: 'x', ends_at: 'y',
    });
    expect(q.update).toHaveBeenCalled();
    expect(q.eq).toHaveBeenCalledWith('id', 'e1');
  });
  it('archiveEvent sets archived_at', async () => {
    const q = makeQuery({ data: null, error: null });
    mockFrom.mockReturnValue(q);
    await archiveEvent('e1');
    expect(q.update).toHaveBeenCalledWith(expect.objectContaining({ archived_at: expect.any(String) }));
  });
  it('restoreEvent nulls archived_at', async () => {
    const q = makeQuery({ data: null, error: null });
    mockFrom.mockReturnValue(q);
    await restoreEvent('e1');
    expect(q.update).toHaveBeenCalledWith({ archived_at: null });
  });
});

describe('selects', () => {
  it('listActiveClients filters archived null', async () => {
    const q = makeQuery({ data: [{ id: 'c1', name: 'X', contact_email: 'x@x.com' }], error: null });
    mockFrom.mockReturnValue(q);
    const r = await listActiveClients();
    expect(mockFrom).toHaveBeenCalledWith('clients');
    expect(q.is).toHaveBeenCalledWith('archived_at', null);
    expect(r).toEqual([{ id: 'c1', name: 'X', contact_email: 'x@x.com' }]);
  });
  it('listApprovedWorkers filters status approved + archived null', async () => {
    const q = makeQuery({ data: [{ id: 'w1', first_name: 'Ana', last_name: 'P' }], error: null });
    mockFrom.mockReturnValue(q);
    const r = await listApprovedWorkers();
    expect(mockFrom).toHaveBeenCalledWith('workers');
    expect(q.eq).toHaveBeenCalledWith('status', 'approved');
    expect(q.is).toHaveBeenCalledWith('archived_at', null);
    expect(r).toEqual([{ id: 'w1', first_name: 'Ana', last_name: 'P' }]);
  });
});

describe('assignments', () => {
  it('listAssignments selects by event with worker join', async () => {
    const q = makeQuery({ data: [{ id: 'a1', workers: { first_name: 'Ana', last_name: 'P' } }], error: null });
    mockFrom.mockReturnValue(q);
    const r = await listAssignments('e1');
    expect(mockFrom).toHaveBeenCalledWith('event_assignments');
    expect(q.select).toHaveBeenCalledWith('*, workers(first_name, last_name)');
    expect(q.eq).toHaveBeenCalledWith('event_id', 'e1');
    expect(r).toEqual([{ id: 'a1', workers: { first_name: 'Ana', last_name: 'P' } }]);
  });
  it('addAssignment inserts the row', async () => {
    const q = makeQuery({ data: null, error: null });
    mockFrom.mockReturnValue(q);
    await addAssignment('e1', 'w1', '2026-05-20T08:00:00.000Z', '2026-05-20T20:00:00.000Z');
    expect(q.insert).toHaveBeenCalledWith({
      event_id: 'e1', worker_id: 'w1',
      scheduled_start: '2026-05-20T08:00:00.000Z', scheduled_end: '2026-05-20T20:00:00.000Z',
    });
  });
  it('updateAssignment updates schedule by id', async () => {
    const q = makeQuery({ data: null, error: null });
    mockFrom.mockReturnValue(q);
    await updateAssignment('a1', '2026-05-20T09:00:00.000Z', '2026-05-20T13:00:00.000Z');
    expect(q.update).toHaveBeenCalledWith({
      scheduled_start: '2026-05-20T09:00:00.000Z', scheduled_end: '2026-05-20T13:00:00.000Z',
    });
    expect(q.eq).toHaveBeenCalledWith('id', 'a1');
  });
  it('removeAssignment deletes by id', async () => {
    const q = makeQuery({ data: null, error: null });
    // delete() chainable: añadir al makeQuery via override
    (q as Record<string, unknown>).delete = vi.fn(() => q);
    mockFrom.mockReturnValue(q);
    await removeAssignment('a1');
    expect((q as Record<string, unknown>).delete).toHaveBeenCalled();
    expect(q.eq).toHaveBeenCalledWith('id', 'a1');
  });
});
```

- [ ] **Step 2: Correr el test (debe fallar)**

Run: `npm run test:run -- src/features/eventos/api.test.ts`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implementar `src/features/eventos/api.ts`**

```ts
import { supabase } from '../../lib/supabase';
import type { EventWithClient, AssignmentWithWorker } from './types';

export type EventInput = {
  client_id: string;
  name: string;
  address: string;
  organizer_email: string;
  starts_at: string;  // ISO
  ends_at: string;    // ISO
};

// --- Eventos ---
export async function listEvents(): Promise<EventWithClient[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*, clients(name)')
    .order('starts_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as EventWithClient[];
}

export async function getEvent(id: string): Promise<EventWithClient | null> {
  const { data, error } = await supabase
    .from('events')
    .select('*, clients(name)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as unknown as EventWithClient | null;
}

// company_id lo rellena el column default desde el claim JWT.
export async function createEvent(input: EventInput): Promise<string> {
  const { data, error } = await supabase
    .from('events')
    .insert(input)
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

export async function updateEvent(id: string, input: EventInput): Promise<void> {
  const { error } = await supabase.from('events').update(input).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function archiveEvent(id: string): Promise<void> {
  const { error } = await supabase
    .from('events')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function restoreEvent(id: string): Promise<void> {
  const { error } = await supabase.from('events').update({ archived_at: null }).eq('id', id);
  if (error) throw new Error(error.message);
}

// --- Selects del form ---
export async function listActiveClients(): Promise<{ id: string; name: string; contact_email: string }[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('id, name, contact_email')
    .is('archived_at', null)
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; name: string; contact_email: string }[];
}

export async function listApprovedWorkers(): Promise<{ id: string; first_name: string; last_name: string }[]> {
  const { data, error } = await supabase
    .from('workers')
    .select('id, first_name, last_name')
    .eq('status', 'approved')
    .is('archived_at', null)
    .order('first_name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; first_name: string; last_name: string }[];
}

// --- Asignaciones ---
export async function listAssignments(eventId: string): Promise<AssignmentWithWorker[]> {
  const { data, error } = await supabase
    .from('event_assignments')
    .select('*, workers(first_name, last_name)')
    .eq('event_id', eventId)
    .order('scheduled_start', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as AssignmentWithWorker[];
}

export async function addAssignment(eventId: string, workerId: string, start: string, end: string): Promise<void> {
  const { error } = await supabase.from('event_assignments').insert({
    event_id: eventId, worker_id: workerId, scheduled_start: start, scheduled_end: end,
  });
  if (error) throw new Error(error.message);
}

export async function updateAssignment(id: string, start: string, end: string): Promise<void> {
  const { error } = await supabase
    .from('event_assignments')
    .update({ scheduled_start: start, scheduled_end: end })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function removeAssignment(id: string): Promise<void> {
  const { error } = await supabase.from('event_assignments').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 4: Correr el test (debe pasar)**

Run: `npm run test:run -- src/features/eventos/api.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/eventos/api.ts src/features/eventos/api.test.ts
git commit -m "feat(events): capa API eventos + asignaciones + selects"
```

NOTE: NO `Co-Authored-By` trailer.

---

### Task 4: Componente `EventoQR`

**Files:**
- Create: `src/features/eventos/EventoQR.tsx`
- Test: `src/features/eventos/EventoQR.test.tsx`

- [ ] **Step 1: Escribir el test primero `src/features/eventos/EventoQR.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EventoQR } from './EventoQR';

describe('EventoQR', () => {
  it('renders the check-in URL text with the access token', () => {
    render(<EventoQR accessToken="tok-123" baseUrl="https://app.example" />);
    expect(screen.getByText('https://app.example/e/tok-123')).toBeInTheDocument();
  });

  it('renders an SVG QR code', () => {
    const { container } = render(<EventoQR accessToken="tok-123" baseUrl="https://app.example" />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr el test (debe fallar)**

Run: `npm run test:run -- src/features/eventos/EventoQR.test.tsx`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implementar `src/features/eventos/EventoQR.tsx`**

```tsx
import { QRCodeSVG } from 'qrcode.react';

type Props = {
  accessToken: string;
  // baseUrl inyectable para tests; en runtime usa env o el origin.
  baseUrl?: string;
};

export function EventoQR({ accessToken, baseUrl }: Props) {
  const base = baseUrl ?? (import.meta.env.VITE_SITE_URL as string | undefined) ?? window.location.origin;
  const url = `${base}/e/${accessToken}`;
  return (
    <div className="flex flex-col items-center gap-2">
      <QRCodeSVG value={url} size={200} />
      <span className="text-xs text-gray-600 select-all break-all">{url}</span>
    </div>
  );
}
```

- [ ] **Step 4: Correr el test (debe pasar)**

Run: `npm run test:run -- src/features/eventos/EventoQR.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/eventos/EventoQR.tsx src/features/eventos/EventoQR.test.tsx
git commit -m "feat(events): EventoQR con qrcode.react"
```

NOTE: NO `Co-Authored-By` trailer.

---

### Task 5: Componente `EventoForm` (modal, alta + edición)

**Files:**
- Create: `src/features/eventos/EventoForm.tsx`
- Test: `src/features/eventos/EventoForm.test.tsx`

- [ ] **Step 1: Escribir el test primero `src/features/eventos/EventoForm.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EventoForm } from './EventoForm';
import type { Event } from './types';

const clients = [
  { id: 'c1', name: 'Bodega X', contact_email: 'info@bodega.com' },
  { id: 'c2', name: 'Ayto Y', contact_email: 'town@y.com' },
];

const existing: Event = {
  id: 'e1', company_id: 'co', client_id: 'c1', name: 'Boda', address: 'Calle 1',
  organizer_email: 'o@x.com', access_token: 'tok', starts_at: '2026-05-20T06:00:00.000Z',
  ends_at: '2026-05-20T18:00:00.000Z', last_confirmation_sent_at: null,
  created_at: '2026-05-19T10:00:00Z', archived_at: null,
};

describe('EventoForm', () => {
  it('renders client options', () => {
    render(<EventoForm clients={clients} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('option', { name: 'Bodega X' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Ayto Y' })).toBeInTheDocument();
  });

  it('shows required errors on empty submit', async () => {
    render(<EventoForm clients={clients} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }));
    expect(await screen.findAllByText(/obligatorio|selecciona/i)).not.toHaveLength(0);
  });

  it('autofills organizer_email from selected client when empty', async () => {
    render(<EventoForm clients={clients} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    await userEvent.selectOptions(screen.getByLabelText(/cliente/i), 'c1');
    expect(screen.getByLabelText(/email del organizador/i)).toHaveValue('info@bodega.com');
  });

  it('shows error when ends_at is before starts_at', async () => {
    render(<EventoForm clients={clients} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    await userEvent.selectOptions(screen.getByLabelText(/cliente/i), 'c1');
    await userEvent.type(screen.getByLabelText(/nombre/i), 'Boda');
    await userEvent.type(screen.getByLabelText(/dirección/i), 'Calle 1');
    await userEvent.type(screen.getByLabelText(/inicio/i), '2026-05-20T20:00');
    await userEvent.type(screen.getByLabelText(/fin/i), '2026-05-20T10:00');
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }));
    expect(await screen.findByText(/posterior al inicio/i)).toBeInTheDocument();
  });

  it('prefills fields in edit mode', () => {
    render(<EventoForm clients={clients} event={existing} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByLabelText(/nombre/i)).toHaveValue('Boda');
    expect(screen.getByLabelText(/dirección/i)).toHaveValue('Calle 1');
    expect(screen.getByLabelText(/email del organizador/i)).toHaveValue('o@x.com');
  });

  it('calls onSubmit with ISO dates on valid submit', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<EventoForm clients={clients} onSubmit={onSubmit} onCancel={vi.fn()} />);
    await userEvent.selectOptions(screen.getByLabelText(/cliente/i), 'c1');
    await userEvent.type(screen.getByLabelText(/nombre/i), 'Boda');
    await userEvent.type(screen.getByLabelText(/dirección/i), 'Calle 1');
    await userEvent.type(screen.getByLabelText(/inicio/i), '2026-05-20T08:00');
    await userEvent.type(screen.getByLabelText(/fin/i), '2026-05-20T20:00');
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.client_id).toBe('c1');
    expect(payload.name).toBe('Boda');
    expect(payload.starts_at).toMatch(/Z$/);  // ISO
    expect(payload.ends_at).toMatch(/Z$/);
  });
});
```

- [ ] **Step 2: Correr el test (debe fallar)**

Run: `npm run test:run -- src/features/eventos/EventoForm.test.tsx`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implementar `src/features/eventos/EventoForm.tsx`**

```tsx
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { Event } from './types';
import type { EventInput } from './api';
import { toISO, toLocalInput } from './dates';

const schema = z.object({
  client_id: z.string().min(1, 'Selecciona un cliente'),
  name: z.string().min(1, 'Obligatorio'),
  address: z.string().min(1, 'Obligatorio'),
  organizer_email: z.string().min(1, 'Obligatorio').email('Email inválido'),
  starts_at: z.string().min(1, 'Obligatorio'),  // datetime-local
  ends_at: z.string().min(1, 'Obligatorio'),
}).refine((d) => d.ends_at > d.starts_at, {
  message: 'El fin debe ser posterior al inicio',
  path: ['ends_at'],
});

type FormValues = z.infer<typeof schema>;

type ClientOption = { id: string; name: string; contact_email: string };

type Props = {
  clients: ClientOption[];
  event?: Event;
  onSubmit: (input: EventInput) => Promise<void> | void;
  onCancel: () => void;
};

export function EventoForm({ clients, event, onSubmit, onCancel }: Props) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      client_id: event?.client_id ?? '',
      name: event?.name ?? '',
      address: event?.address ?? '',
      organizer_email: event?.organizer_email ?? '',
      starts_at: event ? toLocalInput(event.starts_at) : '',
      ends_at: event ? toLocalInput(event.ends_at) : '',
    },
  });

  // Autorrelleno de organizer_email al elegir cliente, solo si está vacío.
  const clientId = watch('client_id');
  useEffect(() => {
    if (!clientId) return;
    if (getValues('organizer_email')) return;
    const c = clients.find((x) => x.id === clientId);
    if (c) setValue('organizer_email', c.contact_email);
  }, [clientId, clients, getValues, setValue]);

  async function handle(values: FormValues) {
    const input: EventInput = {
      client_id: values.client_id,
      name: values.name,
      address: values.address,
      organizer_email: values.organizer_email,
      starts_at: toISO(values.starts_at),
      ends_at: toISO(values.ends_at),
    };
    await onSubmit(input);
  }

  return (
    <form onSubmit={handleSubmit(handle)} className="space-y-4">
      <div>
        <label htmlFor="client_id" className="block mb-1">Cliente</label>
        <select id="client_id" {...register('client_id')} className="border w-full p-2 rounded">
          <option value="">— Selecciona —</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {errors.client_id && <p className="text-red-600 text-sm">{errors.client_id.message}</p>}
      </div>

      <div>
        <label htmlFor="name" className="block mb-1">Nombre</label>
        <input id="name" {...register('name')} className="border w-full p-2 rounded" />
        {errors.name && <p className="text-red-600 text-sm">{errors.name.message}</p>}
      </div>

      <div>
        <label htmlFor="address" className="block mb-1">Dirección</label>
        <input id="address" {...register('address')} className="border w-full p-2 rounded" />
        {errors.address && <p className="text-red-600 text-sm">{errors.address.message}</p>}
      </div>

      <div>
        <label htmlFor="organizer_email" className="block mb-1">Email del organizador</label>
        <input id="organizer_email" {...register('organizer_email')} className="border w-full p-2 rounded" />
        {errors.organizer_email && <p className="text-red-600 text-sm">{errors.organizer_email.message}</p>}
      </div>

      <div>
        <label htmlFor="starts_at" className="block mb-1">Inicio</label>
        <input id="starts_at" type="datetime-local" {...register('starts_at')} className="border w-full p-2 rounded" />
        {errors.starts_at && <p className="text-red-600 text-sm">{errors.starts_at.message}</p>}
      </div>

      <div>
        <label htmlFor="ends_at" className="block mb-1">Fin</label>
        <input id="ends_at" type="datetime-local" {...register('ends_at')} className="border w-full p-2 rounded" />
        {errors.ends_at && <p className="text-red-600 text-sm">{errors.ends_at.message}</p>}
      </div>

      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded border">Cancelar</button>
        <button type="submit" disabled={isSubmitting} className="bg-black text-white px-4 py-2 rounded disabled:opacity-50">
          {isSubmitting ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Correr el test (debe pasar)**

Run: `npm run test:run -- src/features/eventos/EventoForm.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/eventos/EventoForm.tsx src/features/eventos/EventoForm.test.tsx
git commit -m "feat(events): EventoForm RHF+Zod con autorrelleno de organizer_email"
```

NOTE: NO `Co-Authored-By` trailer.

---

### Task 6: `EventosList` + refactor de la ruta

**Files:**
- Create: `src/features/eventos/EventosList.tsx`
- Modify: `src/routes/admin/eventos.tsx`
- Test: `src/features/eventos/EventosList.test.tsx`

- [ ] **Step 1: Escribir el test primero `src/features/eventos/EventosList.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));
vi.mock('react-router-dom', async (orig) => {
  const actual = await orig<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('./api', () => ({
  listEvents: vi.fn(),
  createEvent: vi.fn(),
  archiveEvent: vi.fn(),
  restoreEvent: vi.fn(),
  listActiveClients: vi.fn(),
}));

import { listEvents, createEvent, archiveEvent, listActiveClients } from './api';
import { EventosList } from './EventosList';
import type { EventWithClient } from './types';

// Fechas robustas independientes del reloj real: 2099 siempre es futuro,
// 2020 siempre es pasado. Evita fake timers (que cuelgan con userEvent v14).
const FUTURE = '2099-07-01T08:00:00.000Z';
const FUTURE_END = '2099-07-01T20:00:00.000Z';
const PAST = '2020-05-01T08:00:00.000Z';
const PAST_END = '2020-05-01T20:00:00.000Z';

function mkEvent(over: Partial<EventWithClient> = {}): EventWithClient {
  return {
    id: crypto.randomUUID(), company_id: 'co', client_id: 'c1', name: 'Evento',
    address: 'Calle 1', organizer_email: 'o@x.com', access_token: 'tok',
    starts_at: FUTURE, ends_at: FUTURE_END,
    last_confirmation_sent_at: null, created_at: '2020-01-01T10:00:00Z', archived_at: null,
    clients: { name: 'Bodega X' },
    ...over,
  };
}

beforeEach(() => {
  vi.mocked(listEvents).mockReset();
  vi.mocked(createEvent).mockReset();
  vi.mocked(archiveEvent).mockReset();
  vi.mocked(listActiveClients).mockReset().mockResolvedValue([]);
  mockNavigate.mockReset();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

function renderList() {
  return render(<MemoryRouter><EventosList /></MemoryRouter>);
}

describe('EventosList', () => {
  it('shows upcoming events by default (starts_at >= now, not archived)', async () => {
    vi.mocked(listEvents).mockResolvedValue([
      mkEvent({ name: 'Futuro', starts_at: FUTURE }),
      mkEvent({ name: 'Pasado', starts_at: PAST, ends_at: PAST_END }),
    ]);
    renderList();
    expect(await screen.findByText('Futuro')).toBeInTheDocument();
    expect(screen.queryByText('Pasado')).not.toBeInTheDocument();
  });

  it('switches to Pasados tab', async () => {
    vi.mocked(listEvents).mockResolvedValue([
      mkEvent({ name: 'Futuro', starts_at: FUTURE }),
      mkEvent({ name: 'Pasado', starts_at: PAST, ends_at: PAST_END }),
    ]);
    renderList();
    await screen.findByText('Futuro');
    await userEvent.click(screen.getByRole('button', { name: /pasados/i }));
    expect(await screen.findByText('Pasado')).toBeInTheDocument();
    expect(screen.queryByText('Futuro')).not.toBeInTheDocument();
  });

  it('switches to Archivados tab', async () => {
    vi.mocked(listEvents).mockResolvedValue([
      mkEvent({ name: 'Activo' }),
      mkEvent({ name: 'Archivado', archived_at: '2020-06-10T10:00:00.000Z' }),
    ]);
    renderList();
    await screen.findByText('Activo');
    await userEvent.click(screen.getByRole('button', { name: /archivados/i }));
    expect(await screen.findByText('Archivado')).toBeInTheDocument();
  });

  it('filters by name search', async () => {
    vi.mocked(listEvents).mockResolvedValue([
      mkEvent({ name: 'Boda Pérez', starts_at: FUTURE }),
      mkEvent({ name: 'Congreso', starts_at: FUTURE }),
    ]);
    renderList();
    await screen.findByText('Boda Pérez');
    await userEvent.type(screen.getByPlaceholderText(/buscar/i), 'congreso');
    expect(screen.getByText('Congreso')).toBeInTheDocument();
    expect(screen.queryByText('Boda Pérez')).not.toBeInTheDocument();
  });

  it('creates event and navigates to its detail', async () => {
    vi.mocked(listEvents).mockResolvedValue([]);
    vi.mocked(listActiveClients).mockResolvedValue([{ id: 'c1', name: 'Bodega X', contact_email: 'info@x.com' }]);
    vi.mocked(createEvent).mockResolvedValue('new-id');
    renderList();
    await screen.findByText(/sin eventos/i);
    await userEvent.click(screen.getByRole('button', { name: /nuevo evento/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText(/cliente/i), 'c1');
    await userEvent.type(screen.getByLabelText(/nombre/i), 'Nueva Boda');
    await userEvent.type(screen.getByLabelText(/dirección/i), 'Calle 1');
    await userEvent.type(screen.getByLabelText(/inicio/i), '2099-07-01T08:00');
    await userEvent.type(screen.getByLabelText(/fin/i), '2099-07-01T20:00');
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await vi.waitFor(() => expect(createEvent).toHaveBeenCalled());
    await vi.waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/admin/eventos/new-id'));
  });

  it('archives an event with confirm and refetches', async () => {
    const e = mkEvent({ name: 'Futuro', starts_at: FUTURE });
    vi.mocked(listEvents)
      .mockResolvedValueOnce([e])
      .mockResolvedValueOnce([{ ...e, archived_at: '2099-06-15T12:00:00.000Z' }]);
    vi.mocked(archiveEvent).mockResolvedValue(undefined);
    renderList();
    await screen.findByText('Futuro');
    await userEvent.click(screen.getByRole('button', { name: /archivar/i }));
    expect(window.confirm).toHaveBeenCalled();
    expect(archiveEvent).toHaveBeenCalledWith(e.id);
    await vi.waitFor(() => expect(listEvents).toHaveBeenCalledTimes(2));
  });

  it('shows error banner when listEvents throws', async () => {
    vi.mocked(listEvents).mockRejectedValue(new Error('rls denied'));
    renderList();
    expect(await screen.findByText(/error al cargar/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr el test (debe fallar)**

Run: `npm run test:run -- src/features/eventos/EventosList.test.tsx`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implementar `src/features/eventos/EventosList.tsx`**

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '../../components/Modal';
import { EventoForm } from './EventoForm';
import {
  archiveEvent, createEvent, listActiveClients, listEvents, restoreEvent,
  type EventInput,
} from './api';
import type { EventWithClient } from './types';

type Tab = 'upcoming' | 'past' | 'archived';
type ClientOption = { id: string; name: string; contact_email: string };

export function EventosList() {
  const navigate = useNavigate();
  const [events, setEvents] = useState<EventWithClient[] | null>(null);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('upcoming');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const refetch = useCallback(async () => {
    setError(null);
    try {
      setEvents(await listEvents());
    } catch (e) {
      setError(String(e));
      setEvents([]);
    }
  }, []);

  useEffect(() => { refetch(); }, [refetch]);
  useEffect(() => { listActiveClients().then(setClients).catch(() => setClients([])); }, []);

  const visible = useMemo(() => {
    if (!events) return [];
    const now = new Date().toISOString();
    const term = search.trim().toLowerCase();
    let rows = events.filter((e) => {
      if (tab === 'archived') return e.archived_at !== null;
      if (e.archived_at !== null) return false;
      return tab === 'upcoming' ? e.starts_at >= now : e.starts_at < now;
    });
    if (tab === 'past') rows = [...rows].reverse();  // más reciente primero
    if (term) rows = rows.filter((e) => e.name.toLowerCase().includes(term));
    return rows;
  }, [events, tab, search]);

  async function handleCreate(input: EventInput) {
    setActionError(null);
    try {
      const id = await createEvent(input);
      setCreateOpen(false);
      navigate('/admin/eventos/' + id);
    } catch (e) {
      setActionError(String(e));
    }
  }

  async function handleArchive(id: string) {
    if (!window.confirm('¿Archivar este evento?')) return;
    setActionError(null);
    try { await archiveEvent(id); await refetch(); } catch (e) { setActionError(String(e)); }
  }

  async function handleRestore(id: string) {
    setActionError(null);
    try { await restoreEvent(id); await refetch(); } catch (e) { setActionError(String(e)); }
  }

  const tabCls = (t: Tab) =>
    `px-4 py-2 ${tab === t ? 'border-b-2 border-black font-semibold' : 'text-gray-600'}`;

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 border-b">
        <button type="button" className={tabCls('upcoming')} onClick={() => setTab('upcoming')}>Próximos</button>
        <button type="button" className={tabCls('past')} onClick={() => setTab('past')}>Pasados</button>
        <button type="button" className={tabCls('archived')} onClick={() => setTab('archived')}>Archivados</button>
      </div>

      <div className="flex items-center gap-4 mb-4">
        <input
          type="text"
          placeholder="Buscar por nombre…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border p-2 rounded w-full max-w-sm"
        />
        <button type="button" onClick={() => setCreateOpen(true)} className="ml-auto bg-black text-white px-4 py-2 rounded">
          + Nuevo evento
        </button>
      </div>

      {error && <p className="text-red-600 mb-4">Error al cargar eventos: {error}</p>}
      {actionError && <p className="text-red-600 mb-4">{actionError}</p>}

      {events === null && !error ? (
        <p className="text-gray-500">Cargando…</p>
      ) : visible.length === 0 ? (
        <p className="text-gray-500 py-8 text-center">Sin eventos en esta vista.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2 pr-4">Nombre</th>
              <th className="py-2 pr-4">Cliente</th>
              <th className="py-2 pr-4">Inicio</th>
              <th className="py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((e) => (
              <tr key={e.id} className="border-b">
                <td className="py-2 pr-4">{e.name}</td>
                <td className="py-2 pr-4">{e.clients?.name ?? '—'}</td>
                <td className="py-2 pr-4">{new Date(e.starts_at).toLocaleString('es-ES')}</td>
                <td className="py-2 space-x-2">
                  <button type="button" className="text-blue-600 underline" onClick={() => navigate('/admin/eventos/' + e.id)}>Ver</button>
                  {e.archived_at === null ? (
                    <button type="button" className="text-gray-700 underline" onClick={() => handleArchive(e.id)}>Archivar</button>
                  ) : (
                    <button type="button" className="text-green-700 underline" onClick={() => handleRestore(e.id)}>Restaurar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nuevo evento">
        {createOpen && (
          <EventoForm clients={clients} onSubmit={handleCreate} onCancel={() => setCreateOpen(false)} />
        )}
      </Modal>
    </div>
  );
}
```

- [ ] **Step 4: Refactor `src/routes/admin/eventos.tsx`**

```tsx
import { EventosList } from '../../features/eventos/EventosList';

export default function AdminEventos() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Eventos</h1>
      <EventosList />
    </div>
  );
}
```

- [ ] **Step 5: Correr el test (debe pasar)**

Run: `npm run test:run -- src/features/eventos/EventosList.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add src/features/eventos/EventosList.tsx src/features/eventos/EventosList.test.tsx src/routes/admin/eventos.tsx
git commit -m "feat(events): EventosList con tabs de filtro + alta en modal"
```

NOTE: NO `Co-Authored-By` trailer.

---

### Task 7: `AsignacionesSection`

**Files:**
- Create: `src/features/eventos/AsignacionesSection.tsx`
- Test: `src/features/eventos/AsignacionesSection.test.tsx`

- [ ] **Step 1: Escribir el test primero `src/features/eventos/AsignacionesSection.test.tsx`**

```tsx
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('./api', () => ({
  listAssignments: vi.fn(),
  addAssignment: vi.fn(),
  updateAssignment: vi.fn(),
  removeAssignment: vi.fn(),
  listApprovedWorkers: vi.fn(),
}));

import { listAssignments, addAssignment, removeAssignment, listApprovedWorkers } from './api';
import { AsignacionesSection } from './AsignacionesSection';
import type { AssignmentWithWorker } from './types';

function mkAssignment(over: Partial<AssignmentWithWorker> = {}): AssignmentWithWorker {
  return {
    id: crypto.randomUUID(), event_id: 'e1', worker_id: 'w1',
    scheduled_start: '2026-07-01T08:00:00.000Z', scheduled_end: '2026-07-01T20:00:00.000Z',
    created_at: '2026-06-01T10:00:00Z',
    workers: { first_name: 'Ana', last_name: 'Pérez' },
    ...over,
  };
}

const PROPS = {
  eventId: 'e1',
  eventStart: '2026-07-01T08:00:00.000Z',
  eventEnd: '2026-07-01T20:00:00.000Z',
};

beforeEach(() => {
  vi.mocked(listAssignments).mockReset();
  vi.mocked(addAssignment).mockReset();
  vi.mocked(removeAssignment).mockReset();
  vi.mocked(listApprovedWorkers).mockReset().mockResolvedValue([
    { id: 'w1', first_name: 'Ana', last_name: 'Pérez' },
    { id: 'w2', first_name: 'Beto', last_name: 'López' },
  ]);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('AsignacionesSection', () => {
  it('shows empty state when no assignments', async () => {
    vi.mocked(listAssignments).mockResolvedValue([]);
    render(<AsignacionesSection {...PROPS} />);
    expect(await screen.findByText(/sin trabajadores asignados/i)).toBeInTheDocument();
  });

  it('lists existing assignments with worker name', async () => {
    vi.mocked(listAssignments).mockResolvedValue([mkAssignment()]);
    render(<AsignacionesSection {...PROPS} />);
    expect(await screen.findByText(/Ana Pérez/)).toBeInTheDocument();
  });

  it('adds a worker with the event schedule by default', async () => {
    vi.mocked(listAssignments)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([mkAssignment()]);
    vi.mocked(addAssignment).mockResolvedValue(undefined);
    render(<AsignacionesSection {...PROPS} />);
    await screen.findByText(/sin trabajadores asignados/i);
    await userEvent.type(screen.getByPlaceholderText(/buscar trabajador/i), 'Ana');
    await userEvent.click(screen.getByRole('button', { name: /añadir Ana Pérez/i }));
    expect(addAssignment).toHaveBeenCalledWith('e1', 'w1', PROPS.eventStart, PROPS.eventEnd);
    await vi.waitFor(() => expect(listAssignments).toHaveBeenCalledTimes(2));
  });

  it('duplicates an assignment (split shift)', async () => {
    const a = mkAssignment();
    vi.mocked(listAssignments)
      .mockResolvedValueOnce([a])
      .mockResolvedValueOnce([a, mkAssignment({ id: 'a2' })]);
    vi.mocked(addAssignment).mockResolvedValue(undefined);
    render(<AsignacionesSection {...PROPS} />);
    await screen.findByText(/Ana Pérez/);
    await userEvent.click(screen.getByRole('button', { name: /duplicar/i }));
    expect(addAssignment).toHaveBeenCalledWith('e1', a.worker_id, a.scheduled_start, a.scheduled_end);
    await vi.waitFor(() => expect(listAssignments).toHaveBeenCalledTimes(2));
  });

  it('removes an assignment with confirm', async () => {
    const a = mkAssignment();
    vi.mocked(listAssignments)
      .mockResolvedValueOnce([a])
      .mockResolvedValueOnce([]);
    vi.mocked(removeAssignment).mockResolvedValue(undefined);
    render(<AsignacionesSection {...PROPS} />);
    await screen.findByText(/Ana Pérez/);
    await userEvent.click(screen.getByRole('button', { name: /quitar/i }));
    expect(window.confirm).toHaveBeenCalled();
    expect(removeAssignment).toHaveBeenCalledWith(a.id);
    await vi.waitFor(() => expect(listAssignments).toHaveBeenCalledTimes(2));
  });
});
```

- [ ] **Step 2: Correr el test (debe fallar)**

Run: `npm run test:run -- src/features/eventos/AsignacionesSection.test.tsx`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implementar `src/features/eventos/AsignacionesSection.tsx`**

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addAssignment, listApprovedWorkers, listAssignments, removeAssignment, updateAssignment,
} from './api';
import { toISO, toLocalInput } from './dates';
import type { AssignmentWithWorker } from './types';

type WorkerOption = { id: string; first_name: string; last_name: string };

type Props = {
  eventId: string;
  eventStart: string;  // ISO
  eventEnd: string;    // ISO
};

export function AsignacionesSection({ eventId, eventStart, eventEnd }: Props) {
  const [assignments, setAssignments] = useState<AssignmentWithWorker[] | null>(null);
  const [workers, setWorkers] = useState<WorkerOption[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setError(null);
    try {
      setAssignments(await listAssignments(eventId));
    } catch (e) {
      setError(String(e));
      setAssignments([]);
    }
  }, [eventId]);

  useEffect(() => { refetch(); }, [refetch]);
  useEffect(() => { listApprovedWorkers().then(setWorkers).catch(() => setWorkers([])); }, []);

  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    return workers.filter((w) => `${w.first_name} ${w.last_name}`.toLowerCase().includes(term));
  }, [workers, search]);

  async function handleAdd(workerId: string) {
    setError(null);
    try {
      await addAssignment(eventId, workerId, eventStart, eventEnd);
      setSearch('');
      await refetch();
    } catch (e) { setError(String(e)); }
  }

  async function handleDuplicate(a: AssignmentWithWorker) {
    setError(null);
    try {
      await addAssignment(eventId, a.worker_id, a.scheduled_start, a.scheduled_end);
      await refetch();
    } catch (e) { setError(String(e)); }
  }

  async function handleScheduleChange(id: string, start: string, end: string) {
    setError(null);
    try {
      await updateAssignment(id, start, end);
      await refetch();
    } catch (e) { setError(String(e)); }
  }

  async function handleRemove(id: string) {
    if (!window.confirm('¿Quitar esta asignación?')) return;
    setError(null);
    try {
      await removeAssignment(id);
      await refetch();
    } catch (e) { setError(String(e)); }
  }

  return (
    <div className="mt-6">
      <h2 className="text-lg font-semibold mb-3">Trabajadores asignados</h2>

      <div className="mb-4 relative max-w-sm">
        <input
          type="text"
          placeholder="Buscar trabajador para añadir…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border p-2 rounded w-full"
        />
        {matches.length > 0 && (
          <ul className="absolute z-10 bg-white border rounded w-full mt-1 max-h-48 overflow-y-auto">
            {matches.map((w) => (
              <li key={w.id}>
                <button
                  type="button"
                  onClick={() => handleAdd(w.id)}
                  className="block w-full text-left px-3 py-2 hover:bg-gray-100"
                  aria-label={`Añadir ${w.first_name} ${w.last_name}`}
                >
                  {w.first_name} {w.last_name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <p className="text-red-600 mb-4">{error}</p>}

      {assignments === null ? (
        <p className="text-gray-500">Cargando…</p>
      ) : assignments.length === 0 ? (
        <p className="text-gray-500 py-4">Sin trabajadores asignados.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2 pr-4">Trabajador</th>
              <th className="py-2 pr-4">Inicio</th>
              <th className="py-2 pr-4">Fin</th>
              <th className="py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((a) => (
              <tr key={a.id} className="border-b">
                <td className="py-2 pr-4">{a.workers?.first_name} {a.workers?.last_name}</td>
                <td className="py-2 pr-4">
                  <input
                    type="datetime-local"
                    defaultValue={toLocalInput(a.scheduled_start)}
                    onBlur={(e) => handleScheduleChange(a.id, toISO(e.target.value), a.scheduled_end)}
                    className="border p-1 rounded"
                    aria-label={`Inicio de ${a.workers?.first_name}`}
                  />
                </td>
                <td className="py-2 pr-4">
                  <input
                    type="datetime-local"
                    defaultValue={toLocalInput(a.scheduled_end)}
                    onBlur={(e) => handleScheduleChange(a.id, a.scheduled_start, toISO(e.target.value))}
                    className="border p-1 rounded"
                    aria-label={`Fin de ${a.workers?.first_name}`}
                  />
                </td>
                <td className="py-2 space-x-2">
                  <button type="button" className="text-blue-600 underline" onClick={() => handleDuplicate(a)}>Duplicar</button>
                  <button type="button" className="text-red-700 underline" onClick={() => handleRemove(a.id)}>Quitar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Correr el test (debe pasar)**

Run: `npm run test:run -- src/features/eventos/AsignacionesSection.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/eventos/AsignacionesSection.tsx src/features/eventos/AsignacionesSection.test.tsx
git commit -m "feat(events): AsignacionesSection con buscador, horario partido y edicion inline"
```

NOTE: NO `Co-Authored-By` trailer.

---

### Task 8: `EventoDetalle` + ruta + wiring en App.tsx

**Files:**
- Create: `src/features/eventos/EventoDetalle.tsx`
- Create: `src/routes/admin/evento-detalle.tsx`
- Modify: `src/App.tsx`
- Test: `src/features/eventos/EventoDetalle.test.tsx`

- [ ] **Step 1: Escribir el test primero `src/features/eventos/EventoDetalle.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('./api', () => ({
  getEvent: vi.fn(),
  updateEvent: vi.fn(),
  listActiveClients: vi.fn(),
  // usados por AsignacionesSection (hijo)
  listAssignments: vi.fn(),
  addAssignment: vi.fn(),
  updateAssignment: vi.fn(),
  removeAssignment: vi.fn(),
  listApprovedWorkers: vi.fn(),
}));

import { getEvent, listActiveClients, listAssignments, listApprovedWorkers } from './api';
import { EventoDetalle } from './EventoDetalle';
import type { EventWithClient } from './types';

const EVENT: EventWithClient = {
  id: 'e1', company_id: 'co', client_id: 'c1', name: 'Boda Pérez', address: 'Calle 1',
  organizer_email: 'o@x.com', access_token: 'tok-abc', starts_at: '2026-07-01T08:00:00.000Z',
  ends_at: '2026-07-01T20:00:00.000Z', last_confirmation_sent_at: null,
  created_at: '2026-06-01T10:00:00Z', archived_at: null,
  clients: { name: 'Bodega X' },
};

beforeEach(() => {
  vi.mocked(getEvent).mockReset();
  vi.mocked(listActiveClients).mockReset().mockResolvedValue([]);
  vi.mocked(listAssignments).mockReset().mockResolvedValue([]);
  vi.mocked(listApprovedWorkers).mockReset().mockResolvedValue([]);
});

describe('EventoDetalle', () => {
  it('shows "not found" when event is null', async () => {
    vi.mocked(getEvent).mockResolvedValue(null);
    render(<EventoDetalle eventId="nope" />);
    expect(await screen.findByText(/evento no encontrado/i)).toBeInTheDocument();
  });

  it('renders event data, client name and QR with token', async () => {
    vi.mocked(getEvent).mockResolvedValue(EVENT);
    render(<EventoDetalle eventId="e1" />);
    expect(await screen.findByText('Boda Pérez')).toBeInTheDocument();
    expect(screen.getByText(/Bodega X/)).toBeInTheDocument();
    // QR text contiene el token
    expect(screen.getByText(/\/e\/tok-abc$/)).toBeInTheDocument();
  });

  it('opens edit modal on Editar', async () => {
    vi.mocked(getEvent).mockResolvedValue(EVENT);
    render(<EventoDetalle eventId="e1" />);
    await screen.findByText('Boda Pérez');
    await userEvent.click(screen.getByRole('button', { name: /editar/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('renders the assignments section', async () => {
    vi.mocked(getEvent).mockResolvedValue(EVENT);
    render(<EventoDetalle eventId="e1" />);
    expect(await screen.findByText(/trabajadores asignados/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr el test (debe fallar)**

Run: `npm run test:run -- src/features/eventos/EventoDetalle.test.tsx`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implementar `src/features/eventos/EventoDetalle.tsx`**

```tsx
import { useCallback, useEffect, useState } from 'react';
import { Modal } from '../../components/Modal';
import { EventoForm } from './EventoForm';
import { EventoQR } from './EventoQR';
import { AsignacionesSection } from './AsignacionesSection';
import { getEvent, listActiveClients, updateEvent, type EventInput } from './api';
import type { EventWithClient } from './types';

type ClientOption = { id: string; name: string; contact_email: string };

type Props = { eventId: string };

export function EventoDetalle({ eventId }: Props) {
  const [event, setEvent] = useState<EventWithClient | null | undefined>(undefined);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const refetch = useCallback(async () => {
    setError(null);
    try {
      setEvent(await getEvent(eventId));
    } catch (e) {
      setError(String(e));
      setEvent(null);
    }
  }, [eventId]);

  useEffect(() => { refetch(); }, [refetch]);
  useEffect(() => { listActiveClients().then(setClients).catch(() => setClients([])); }, []);

  async function handleEdit(input: EventInput) {
    setError(null);
    try {
      await updateEvent(eventId, input);
      setEditOpen(false);
      await refetch();
    } catch (e) { setError(String(e)); }
  }

  if (event === undefined) return <p className="text-gray-500">Cargando…</p>;
  if (event === null) return <p className="text-red-600">Evento no encontrado.</p>;

  const fmt = (iso: string) => new Date(iso).toLocaleString('es-ES');

  return (
    <div>
      {error && <p className="text-red-600 mb-4">{error}</p>}

      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">{event.name}</h1>
          <p className="text-gray-700"><span className="font-semibold">Cliente:</span> {event.clients?.name ?? '—'}</p>
          <p className="text-gray-700"><span className="font-semibold">Dirección:</span> {event.address}</p>
          <p className="text-gray-700"><span className="font-semibold">Organizador:</span> {event.organizer_email}</p>
          <p className="text-gray-700"><span className="font-semibold">Inicio:</span> {fmt(event.starts_at)}</p>
          <p className="text-gray-700"><span className="font-semibold">Fin:</span> {fmt(event.ends_at)}</p>
          <button type="button" onClick={() => setEditOpen(true)} className="mt-2 text-blue-600 underline">Editar</button>
        </div>
        <EventoQR accessToken={event.access_token} />
      </div>

      <AsignacionesSection eventId={event.id} eventStart={event.starts_at} eventEnd={event.ends_at} />

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Editar evento">
        {editOpen && (
          <EventoForm clients={clients} event={event} onSubmit={handleEdit} onCancel={() => setEditOpen(false)} />
        )}
      </Modal>
    </div>
  );
}
```

- [ ] **Step 4: Crear la ruta `src/routes/admin/evento-detalle.tsx`**

```tsx
import { useParams } from 'react-router-dom';
import { EventoDetalle } from '../../features/eventos/EventoDetalle';

export default function AdminEventoDetalle() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <p className="text-red-600">Falta el id del evento.</p>;
  return <EventoDetalle eventId={id} />;
}
```

- [ ] **Step 5: Añadir la ruta hija en `src/App.tsx`**

Añadir import junto a los demás de admin:
```tsx
import AdminEventoDetalle from "./routes/admin/evento-detalle";
```
Y añadir la ruta hija dentro de `children` de `/admin`, justo después de `{ path: "eventos", element: <AdminEventos /> },`:
```tsx
      { path: "eventos/:id", element: <AdminEventoDetalle /> },
```

- [ ] **Step 6: Correr el test (debe pasar)**

Run: `npm run test:run -- src/features/eventos/EventoDetalle.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 7: Correr toda la suite + build**

Run: `npm run test:run`
Expected: todos PASS (nuevos + existentes).

Run: `npm run build`
Expected: build OK.

- [ ] **Step 8: Commit**

```bash
git add src/features/eventos/EventoDetalle.tsx src/features/eventos/EventoDetalle.test.tsx src/routes/admin/evento-detalle.tsx src/App.tsx
git commit -m "feat(events): pagina de detalle con QR, edicion y asignaciones + ruta :id"
```

NOTE: NO `Co-Authored-By` trailer.

---

### Task 9: Tests pgTAP

**Files:**
- Create: `supabase/tests/events_rls.sql`
- Create: `supabase/tests/events_company_default.sql`
- Create: `supabase/tests/event_assignments_rls.sql`
- Create: `supabase/tests/event_assignments_split_shift.sql`
- Create: `supabase/tests/events_audit_attached.sql`
- Create: `supabase/tests/event_assignments_audit_attached.sql`

Nota: Docker no está disponible localmente. Crear y commitear los archivos; la ejecución se hará contra cloud tras `db push` (paso de despliegue). NO ejecutar `npx supabase test db`.

- [ ] **Step 1: Crear `supabase/tests/events_rls.sql`**

```sql
-- Aislamiento tenant en events + WITH CHECK rechaza company_id ajeno.
begin;
select plan(3);

insert into auth.users (id, email, encrypted_password, email_confirmed_at) values
  ('11111111-1111-1111-1111-111111111111', 'ea@a.com', '', now()),
  ('22222222-2222-2222-2222-222222222222', 'eb@b.com', '', now());

insert into public.companies (id, name, slug) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Empresa A', 'empresa-a-ev'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Empresa B', 'empresa-b-ev');

insert into public.admin_users (id, company_id, email, full_name) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ea@a.com', 'A'),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'eb@b.com', 'B');

insert into public.clients (id, company_id, name, contact_email) values
  ('c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Cli A', 'a@cli.com'),
  ('c2222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Cli B', 'b@cli.com');

insert into public.events (id, company_id, client_id, name, address, organizer_email, starts_at, ends_at) values
  ('e1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c1111111-1111-1111-1111-111111111111', 'Ev A', 'Dir', 'o@a.com', now(), now() + interval '1 hour'),
  ('e2222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'c2222222-2222-2222-2222-222222222222', 'Ev B', 'Dir', 'o@b.com', now(), now() + interval '1 hour');

set local role authenticated;
set local "request.jwt.claims" to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","company_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';

select results_eq(
  $$ select count(*)::int from public.events $$,
  $$ values (1) $$,
  'admin A only sees own company events'
);

select results_eq(
  $$ select count(*)::int from public.events where name = 'Ev B' $$,
  $$ values (0) $$,
  'admin A cannot see company B event'
);

select throws_ok(
  $$ insert into public.events (company_id, client_id, name, address, organizer_email, starts_at, ends_at)
     values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'c2222222-2222-2222-2222-222222222222', 'Intruso', 'D', 'o@x.com', now(), now() + interval '1 hour') $$,
  '42501',
  'new row violates row-level security policy for table "events"',
  'WITH CHECK blocks INSERT with foreign company_id'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Crear `supabase/tests/events_company_default.sql`**

```sql
-- El default de company_id rellena el valor desde el claim al insertar sin él.
begin;
select plan(1);

insert into auth.users (id, email, encrypted_password, email_confirmed_at) values
  ('33333333-3333-3333-3333-333333333333', 'ed@a.com', '', now());
insert into public.companies (id, name, slug) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Def Co', 'def-co-ev');
insert into public.admin_users (id, company_id, email, full_name) values
  ('33333333-3333-3333-3333-333333333333', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'ed@a.com', 'D');
insert into public.clients (id, company_id, name, contact_email) values
  ('c3333333-3333-3333-3333-333333333333', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'Cli', 'c@cli.com');

set local role authenticated;
set local "request.jwt.claims" to
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","company_id":"cccccccc-cccc-cccc-cccc-cccccccccccc"}';

insert into public.events (client_id, name, address, organizer_email, starts_at, ends_at)
values ('c3333333-3333-3333-3333-333333333333', 'Sin Company', 'Dir', 'o@x.com', now(), now() + interval '1 hour');

select results_eq(
  $$ select company_id from public.events where name = 'Sin Company' $$,
  $$ values ('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid) $$,
  'events.company_id default fills from JWT claim'
);

select * from finish();
rollback;
```

- [ ] **Step 3: Crear `supabase/tests/event_assignments_rls.sql`**

```sql
-- RLS de event_assignments via evento padre: admin A no ve ni inserta
-- asignaciones de eventos de B.
begin;
select plan(2);

insert into auth.users (id, email, encrypted_password, email_confirmed_at) values
  ('44444444-4444-4444-4444-444444444444', 'aa@a.com', '', now());
insert into public.companies (id, name, slug) values
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'Comp A', 'comp-a-ea'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'Comp B', 'comp-b-ea');
insert into public.admin_users (id, company_id, email, full_name) values
  ('44444444-4444-4444-4444-444444444444', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'aa@a.com', 'A');
insert into public.clients (id, company_id, name, contact_email) values
  ('c4444444-4444-4444-4444-444444444444', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'Cli A', 'a@c.com'),
  ('c5555555-5555-5555-5555-555555555555', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'Cli B', 'b@c.com');
insert into public.workers (id, company_id, email, phone, first_name, last_name, status) values
  ('40000000-0000-0000-0000-000000000000', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'wa@x.com', '600000001', 'WA', 'T', 'approved'),
  ('50000000-0000-0000-0000-000000000000', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'wb@x.com', '600000002', 'WB', 'T', 'approved');
insert into public.events (id, company_id, client_id, name, address, organizer_email, starts_at, ends_at) values
  ('e4444444-4444-4444-4444-444444444444', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'c4444444-4444-4444-4444-444444444444', 'Ev A', 'D', 'o@a.com', now(), now() + interval '2 hours'),
  ('e5555555-5555-5555-5555-555555555555', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'c5555555-5555-5555-5555-555555555555', 'Ev B', 'D', 'o@b.com', now(), now() + interval '2 hours');
insert into public.event_assignments (event_id, worker_id, scheduled_start, scheduled_end) values
  ('e4444444-4444-4444-4444-444444444444', '40000000-0000-0000-0000-000000000000', now(), now() + interval '2 hours'),
  ('e5555555-5555-5555-5555-555555555555', '50000000-0000-0000-0000-000000000000', now(), now() + interval '2 hours');

set local role authenticated;
set local "request.jwt.claims" to
  '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated","company_id":"dddddddd-dddd-dddd-dddd-dddddddddddd"}';

select results_eq(
  $$ select count(*)::int from public.event_assignments $$,
  $$ values (1) $$,
  'admin A only sees assignments of own events'
);

select throws_ok(
  $$ insert into public.event_assignments (event_id, worker_id, scheduled_start, scheduled_end)
     values ('e5555555-5555-5555-5555-555555555555', '40000000-0000-0000-0000-000000000000', now(), now() + interval '1 hour') $$,
  '42501',
  'new row violates row-level security policy for table "event_assignments"',
  'cannot insert assignment into another tenant event'
);

select * from finish();
rollback;
```

- [ ] **Step 4: Crear `supabase/tests/event_assignments_split_shift.sql`**

```sql
-- Dos asignaciones del mismo worker en el mismo evento son válidas (horario partido).
begin;
select plan(1);

insert into auth.users (id, email, encrypted_password, email_confirmed_at) values
  ('66666666-6666-6666-6666-666666666666', 'ss@a.com', '', now());
insert into public.companies (id, name, slug) values
  ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'SS Co', 'ss-co');
insert into public.admin_users (id, company_id, email, full_name) values
  ('66666666-6666-6666-6666-666666666666', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'ss@a.com', 'SS');
insert into public.clients (id, company_id, name, contact_email) values
  ('c6666666-6666-6666-6666-666666666666', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'Cli', 'c@c.com');
insert into public.workers (id, company_id, email, phone, first_name, last_name, status) values
  ('60000000-0000-0000-0000-000000000000', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'w@x.com', '600000003', 'W', 'T', 'approved');
insert into public.events (id, company_id, client_id, name, address, organizer_email, starts_at, ends_at) values
  ('e6666666-6666-6666-6666-666666666666', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'c6666666-6666-6666-6666-666666666666', 'Ev', 'D', 'o@x.com', now(), now() + interval '12 hours');

-- Dos turnos del mismo worker en el mismo evento (mañana y tarde)
insert into public.event_assignments (event_id, worker_id, scheduled_start, scheduled_end) values
  ('e6666666-6666-6666-6666-666666666666', '60000000-0000-0000-0000-000000000000', now(), now() + interval '4 hours'),
  ('e6666666-6666-6666-6666-666666666666', '60000000-0000-0000-0000-000000000000', now() + interval '6 hours', now() + interval '10 hours');

select results_eq(
  $$ select count(*)::int from public.event_assignments
     where event_id = 'e6666666-6666-6666-6666-666666666666'
       and worker_id = '60000000-0000-0000-0000-000000000000' $$,
  $$ values (2) $$,
  'same worker can have two assignments in the same event (split shift)'
);

select * from finish();
rollback;
```

- [ ] **Step 5: Crear `supabase/tests/events_audit_attached.sql`**

```sql
-- El trigger audita mutaciones en events con action correcto.
begin;
select plan(3);

insert into auth.users (id, email, encrypted_password, email_confirmed_at) values
  ('77777777-7777-7777-7777-777777777777', 'au@a.com', '', now());
insert into public.companies (id, name, slug) values
  ('a7777777-7777-7777-7777-777777777777', 'Audit Ev Co', 'audit-ev-co');
insert into public.admin_users (id, company_id, email, full_name) values
  ('77777777-7777-7777-7777-777777777777', 'a7777777-7777-7777-7777-777777777777', 'au@a.com', 'Au');
insert into public.clients (id, company_id, name, contact_email) values
  ('c7777777-7777-7777-7777-777777777777', 'a7777777-7777-7777-7777-777777777777', 'Cli', 'c@c.com');

set local role authenticated;
set local "request.jwt.claims" to
  '{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated","company_id":"a7777777-7777-7777-7777-777777777777"}';

insert into public.events (id, client_id, name, address, organizer_email, starts_at, ends_at)
values ('e7777777-7777-7777-7777-777777777777', 'c7777777-7777-7777-7777-777777777777', 'Ev Audit', 'D', 'o@x.com', now(), now() + interval '1 hour');

select results_eq(
  $$ select action from public.audit_log where entity_id = 'e7777777-7777-7777-7777-777777777777' and action like 'events.%' order by created_at $$,
  $$ values ('events.insert'::text) $$,
  'INSERT on events produces events.insert audit row'
);

update public.events set name = 'Renombrado' where id = 'e7777777-7777-7777-7777-777777777777';
select ok(
  exists(select 1 from public.audit_log where entity_id = 'e7777777-7777-7777-7777-777777777777'
    and action = 'events.update' and diff -> 'after' ->> 'name' = 'Renombrado'),
  'UPDATE on events audits name change'
);

delete from public.events where id = 'e7777777-7777-7777-7777-777777777777';
select ok(
  exists(select 1 from public.audit_log where entity_id = 'e7777777-7777-7777-7777-777777777777' and action = 'events.delete'),
  'DELETE on events produces events.delete audit row'
);

select * from finish();
rollback;
```

- [ ] **Step 6: Crear `supabase/tests/event_assignments_audit_attached.sql`**

```sql
-- El trigger audita event_assignments resolviendo company_id via el evento padre.
begin;
select plan(2);

insert into auth.users (id, email, encrypted_password, email_confirmed_at) values
  ('88888888-8888-8888-8888-888888888888', 'aua@a.com', '', now());
insert into public.companies (id, name, slug) values
  ('a8888888-8888-8888-8888-888888888888', 'Audit EA Co', 'audit-ea-co');
insert into public.admin_users (id, company_id, email, full_name) values
  ('88888888-8888-8888-8888-888888888888', 'a8888888-8888-8888-8888-888888888888', 'aua@a.com', 'Aua');
insert into public.clients (id, company_id, name, contact_email) values
  ('c8888888-8888-8888-8888-888888888888', 'a8888888-8888-8888-8888-888888888888', 'Cli', 'c@c.com');
insert into public.workers (id, company_id, email, phone, first_name, last_name, status) values
  ('80000000-0000-0000-0000-000000000000', 'a8888888-8888-8888-8888-888888888888', 'w@x.com', '600000004', 'W', 'T', 'approved');
insert into public.events (id, company_id, client_id, name, address, organizer_email, starts_at, ends_at) values
  ('e8888888-8888-8888-8888-888888888888', 'a8888888-8888-8888-8888-888888888888', 'c8888888-8888-8888-8888-888888888888', 'Ev', 'D', 'o@x.com', now(), now() + interval '2 hours');

set local role authenticated;
set local "request.jwt.claims" to
  '{"sub":"88888888-8888-8888-8888-888888888888","role":"authenticated","company_id":"a8888888-8888-8888-8888-888888888888"}';

insert into public.event_assignments (id, event_id, worker_id, scheduled_start, scheduled_end)
values ('aa888888-8888-8888-8888-888888888888', 'e8888888-8888-8888-8888-888888888888', '80000000-0000-0000-0000-000000000000', now(), now() + interval '2 hours');

select results_eq(
  $$ select action from public.audit_log where entity_id = 'aa888888-8888-8888-8888-888888888888' and action like 'event_assignments.%' $$,
  $$ values ('event_assignments.insert'::text) $$,
  'INSERT on event_assignments produces audit row'
);

select results_eq(
  $$ select company_id from public.audit_log where entity_id = 'aa888888-8888-8888-8888-888888888888' and action = 'event_assignments.insert' $$,
  $$ values ('a8888888-8888-8888-8888-888888888888'::uuid) $$,
  'audit company_id resolved from parent event'
);

select * from finish();
rollback;
```

- [ ] **Step 7: Commit**

```bash
git add supabase/tests/events_rls.sql supabase/tests/events_company_default.sql supabase/tests/event_assignments_rls.sql supabase/tests/event_assignments_split_shift.sql supabase/tests/events_audit_attached.sql supabase/tests/event_assignments_audit_attached.sql
git commit -m "test(events): pgTAP RLS, default, split-shift y audit de events + event_assignments"
```

NOTE: NO `Co-Authored-By` trailer.

---

## Pasos finales (fuera de subagent-driven; controlador/usuario)

1. **Aplicar migración a cloud**: `npx supabase db push` (PEDIR CONFIRMACIÓN). Crea `events` + `event_assignments`.
2. **Push del feature branch** (PEDIR CONFIRMACIÓN).
3. **PR feat → develop** → preview Cloudflare.
4. **Smoke E2E manual** (spec §6.3) contra el preview.
5. **PR develop → main** tras OK.
6. **Mergear** la rama `docs/m2-phase-3a-events-spec` en el mismo flujo.
7. Sin tag (el tag de M2 llega al cerrar Fase 3b).

## Self-review checklist (controlador)

- [ ] Spec coverage: cada criterio §7 del spec tiene test o queda en smoke.
- [ ] Sin TODOs ni placeholders.
- [ ] Consistencia de tipos: `Event`, `EventWithClient`, `EventInput`, `AssignmentWithWorker` de un solo sitio; nombres de funciones API coinciden entre `api.ts`, tests y componentes.
- [ ] `npm run build` + `npm run test:run` verdes.
- [ ] Migración aplicada en cloud antes del smoke.
