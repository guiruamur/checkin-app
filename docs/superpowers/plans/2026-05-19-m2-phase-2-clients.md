# M2 Fase 2 — Clientes (CRUD admin): Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CRUD de admin para el catálogo de clientes finales por empresa: listar, crear, editar, archivar y restaurar, con búsqueda y aislamiento multi-tenant.

**Architecture:** Tabla `clients` con `company_id` auto-rellenado por column default desde el claim JWT + RLS `WITH CHECK`. Frontend en `features/clientes/` (mismo patrón que `features/workers/`): capa API con supabase-js directo, tabla pura, form en modal (alta+edición), orquestador con búsqueda y toggle de archivados. Sin Edge Functions, sin email.

**Tech Stack:** React 19 + Vite + TypeScript + React Router v7 + React Hook Form + Zod + Tailwind v3 + supabase-js + Vitest + RTL + pgTAP.

**Spec:** `docs/superpowers/specs/2026-05-19-m2-phase-2-clients-design.md`

---

### Task 1: Migración `clients` + tipo `Client` + tipo en database.ts

**Files:**
- Create: `supabase/migrations/20260519120000_clients.sql`
- Create: `src/features/clientes/types.ts`
- Modify: `src/types/database.ts` (añadir tabla `clients` en `public.Tables`)

- [ ] **Step 1: Crear la migración `supabase/migrations/20260519120000_clients.sql`**

```sql
-- Fase 2: tabla clients (catálogo de clientes finales por tenant).
--
-- CRUD puro de admin: INSERT/UPDATE vienen del SPA autenticado (no de
-- service_role como workers), por eso:
--   - company_id tiene default que lo rellena del claim JWT.
--   - la policy lleva WITH CHECK explícito (impide insertar/actualizar
--     con company_id ajeno aunque el cliente manipule el payload).
-- El trigger genérico log_audit_event (Fase 0) audita toda mutación.

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default (auth.jwt() ->> 'company_id')::uuid
    references public.companies (id) on delete cascade,
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
  using (company_id = (auth.jwt() ->> 'company_id')::uuid)
  with check (company_id = (auth.jwt() ->> 'company_id')::uuid);

create trigger clients_audit
  after insert or update or delete on public.clients
  for each row execute function public.log_audit_event();
```

- [ ] **Step 2: Crear `src/features/clientes/types.ts`**

```ts
export type Client = {
  id: string;
  company_id: string;
  name: string;
  contact_email: string;
  phone: string | null;
  notes: string | null;
  created_at: string;
  archived_at: string | null;
};
```

- [ ] **Step 3: Añadir la tabla `clients` a `src/types/database.ts`**

Localiza el bloque `workers: { ... }` dentro de `public: { Tables: { ... } }` (lo añadimos en Fase 1b). Justo después del cierre de `workers` (su `Relationships: [...]` y la `}` que lo cierra), añade el bloque `clients`:

```ts
      clients: {
        Row: {
          id: string
          company_id: string
          name: string
          contact_email: string
          phone: string | null
          notes: string | null
          created_at: string
          archived_at: string | null
        }
        Insert: {
          id?: string
          company_id?: string
          name: string
          contact_email: string
          phone?: string | null
          notes?: string | null
          created_at?: string
          archived_at?: string | null
        }
        Update: {
          id?: string
          company_id?: string
          name?: string
          contact_email?: string
          phone?: string | null
          notes?: string | null
          created_at?: string
          archived_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
```

Nota: `company_id` es opcional en `Insert` (`company_id?`) porque el default de columna lo rellena desde el claim JWT — el frontend no lo envía.

- [ ] **Step 4: Verificar que el build TS no rompe**

Run: `npm run build`
Expected: build OK (la tabla `clients` ya es conocida por el tipo `Database`, aunque todavía no se use).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260519120000_clients.sql src/features/clientes/types.ts src/types/database.ts
git commit -m "feat(clients): migracion tabla clients + tipo Client + database.ts"
```

---

### Task 2: Capa API `features/clientes/api.ts`

**Files:**
- Create: `src/features/clientes/api.ts`
- Test: `src/features/clientes/api.test.ts`

- [ ] **Step 1: Escribir el test primero `src/features/clientes/api.test.ts`**

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockSelect, mockOrder, mockInsert, mockUpdate, mockEq, mockFrom } = vi.hoisted(() => {
  const mockOrder = vi.fn();
  const mockSelect = vi.fn(() => ({ order: mockOrder }));
  const mockEq = vi.fn();
  const mockInsert = vi.fn();
  const mockUpdate = vi.fn(() => ({ eq: mockEq }));
  const mockFrom = vi.fn(() => ({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
  }));
  return { mockSelect, mockOrder, mockInsert, mockUpdate, mockEq, mockFrom };
});

vi.mock('../../lib/supabase', () => ({
  supabase: { from: mockFrom },
}));

import { listClients, createClient, updateClient, archiveClient, restoreClient } from './api';

beforeEach(() => {
  mockOrder.mockReset();
  mockSelect.mockReset().mockReturnValue({ order: mockOrder });
  mockEq.mockReset();
  mockInsert.mockReset();
  mockUpdate.mockReset().mockReturnValue({ eq: mockEq });
});

describe('listClients', () => {
  it('returns rows ordered by name', async () => {
    mockOrder.mockResolvedValue({ data: [{ id: 'c1', name: 'Ana' }], error: null });
    const r = await listClients();
    expect(mockFrom).toHaveBeenCalledWith('clients');
    expect(mockSelect).toHaveBeenCalledWith('*');
    expect(mockOrder).toHaveBeenCalledWith('name', { ascending: true });
    expect(r).toEqual([{ id: 'c1', name: 'Ana' }]);
  });
  it('throws on error', async () => {
    mockOrder.mockResolvedValue({ data: null, error: { message: 'rls' } });
    await expect(listClients()).rejects.toThrow('rls');
  });
  it('returns [] when data is null', async () => {
    mockOrder.mockResolvedValue({ data: null, error: null });
    expect(await listClients()).toEqual([]);
  });
});

describe('createClient', () => {
  it('inserts the input without company_id', async () => {
    mockInsert.mockResolvedValue({ error: null });
    await createClient({ name: 'X', contact_email: 'x@y.com' });
    expect(mockInsert).toHaveBeenCalledWith({ name: 'X', contact_email: 'x@y.com' });
  });
  it('throws on error', async () => {
    mockInsert.mockResolvedValue({ error: { message: 'check' } });
    await expect(createClient({ name: 'X', contact_email: 'x@y.com' })).rejects.toThrow('check');
  });
});

describe('updateClient', () => {
  it('updates fields by id', async () => {
    mockEq.mockResolvedValue({ error: null });
    await updateClient('c1', { name: 'Y', contact_email: 'y@y.com' });
    expect(mockUpdate).toHaveBeenCalledWith({ name: 'Y', contact_email: 'y@y.com' });
    expect(mockEq).toHaveBeenCalledWith('id', 'c1');
  });
  it('throws on error', async () => {
    mockEq.mockResolvedValue({ error: { message: 'boom' } });
    await expect(updateClient('c1', { name: 'Y', contact_email: 'y@y.com' })).rejects.toThrow('boom');
  });
});

describe('archiveClient', () => {
  it('sets archived_at to a timestamp', async () => {
    mockEq.mockResolvedValue({ error: null });
    await archiveClient('c1');
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ archived_at: expect.any(String) }));
    expect(mockEq).toHaveBeenCalledWith('id', 'c1');
  });
});

describe('restoreClient', () => {
  it('sets archived_at to null', async () => {
    mockEq.mockResolvedValue({ error: null });
    await restoreClient('c1');
    expect(mockUpdate).toHaveBeenCalledWith({ archived_at: null });
    expect(mockEq).toHaveBeenCalledWith('id', 'c1');
  });
});
```

- [ ] **Step 2: Correr el test (debe fallar)**

Run: `npm run test:run -- src/features/clientes/api.test.ts`
Expected: FAIL — el módulo `./api` no existe.

- [ ] **Step 3: Implementar `src/features/clientes/api.ts`**

```ts
import { supabase } from '../../lib/supabase';
import type { Client } from './types';

export type ClientInput = {
  name: string;
  contact_email: string;
  phone?: string;
  notes?: string;
};

// RLS filtra por tenant automáticamente. Orden alfabético por nombre.
export async function listClients(): Promise<Client[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Client[];
}

// company_id lo rellena el default de columna desde el claim JWT.
export async function createClient(input: ClientInput): Promise<void> {
  const { error } = await supabase.from('clients').insert(input);
  if (error) throw new Error(error.message);
}

export async function updateClient(id: string, input: ClientInput): Promise<void> {
  const { error } = await supabase.from('clients').update(input).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function archiveClient(id: string): Promise<void> {
  const { error } = await supabase
    .from('clients')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function restoreClient(id: string): Promise<void> {
  const { error } = await supabase
    .from('clients')
    .update({ archived_at: null })
    .eq('id', id);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 4: Correr el test (debe pasar)**

Run: `npm run test:run -- src/features/clientes/api.test.ts`
Expected: PASS (12 asserts en 5 describes).

- [ ] **Step 5: Commit**

```bash
git add src/features/clientes/api.ts src/features/clientes/api.test.ts
git commit -m "feat(clients): capa API supabase-js (list/create/update/archive/restore)"
```

---

### Task 3: Componente `ClienteForm` (modal alta + edición)

**Files:**
- Create: `src/features/clientes/ClienteForm.tsx`
- Test: `src/features/clientes/ClienteForm.test.tsx`

- [ ] **Step 1: Escribir el test primero `src/features/clientes/ClienteForm.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ClienteForm } from './ClienteForm';
import type { Client } from './types';

const existing: Client = {
  id: 'c1', company_id: 'co', name: 'Bodega X', contact_email: 'info@bodega.com',
  phone: '912345678', notes: 'Cliente habitual', created_at: '2026-05-19T10:00:00Z',
  archived_at: null,
};

describe('ClienteForm', () => {
  it('renders empty fields for create mode', () => {
    render(<ClienteForm onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByLabelText(/nombre/i)).toHaveValue('');
    expect(screen.getByLabelText(/email de contacto/i)).toHaveValue('');
  });

  it('prefills fields in edit mode', () => {
    render(<ClienteForm client={existing} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByLabelText(/nombre/i)).toHaveValue('Bodega X');
    expect(screen.getByLabelText(/email de contacto/i)).toHaveValue('info@bodega.com');
    expect(screen.getByLabelText(/teléfono/i)).toHaveValue('912345678');
    expect(screen.getByLabelText(/notas/i)).toHaveValue('Cliente habitual');
  });

  it('shows required errors when submitted empty', async () => {
    render(<ClienteForm onSubmit={vi.fn()} onCancel={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }));
    expect(await screen.findAllByText(/obligatorio/i)).not.toHaveLength(0);
  });

  it('shows email format error', async () => {
    render(<ClienteForm onSubmit={vi.fn()} onCancel={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/nombre/i), 'X');
    await userEvent.type(screen.getByLabelText(/email de contacto/i), 'no-es-email');
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }));
    expect(await screen.findByText(/email inválido/i)).toBeInTheDocument();
  });

  it('shows phone format error for letters', async () => {
    render(<ClienteForm onSubmit={vi.fn()} onCancel={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/nombre/i), 'X');
    await userEvent.type(screen.getByLabelText(/email de contacto/i), 'x@y.com');
    await userEvent.type(screen.getByLabelText(/teléfono/i), 'abc');
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }));
    expect(await screen.findByText(/teléfono inválido/i)).toBeInTheDocument();
  });

  it('calls onSubmit with normalized payload, omitting empty optionals', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ClienteForm onSubmit={onSubmit} onCancel={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/nombre/i), 'Bodega X');
    await userEvent.type(screen.getByLabelText(/email de contacto/i), 'info@bodega.com');
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const payload = onSubmit.mock.calls[0][0];
    expect(payload).toEqual({ name: 'Bodega X', contact_email: 'info@bodega.com' });
    expect(payload.phone).toBeUndefined();
    expect(payload.notes).toBeUndefined();
  });

  it('calls onCancel when cancel button clicked', async () => {
    const onCancel = vi.fn();
    render(<ClienteForm onSubmit={vi.fn()} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: /cancelar/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Correr el test (debe fallar)**

Run: `npm run test:run -- src/features/clientes/ClienteForm.test.tsx`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Implementar `src/features/clientes/ClienteForm.tsx`**

```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { Client } from './types';
import type { ClientInput } from './api';

const schema = z.object({
  name: z.string().min(1, 'Obligatorio'),
  contact_email: z.string().min(1, 'Obligatorio').email('Email inválido'),
  phone: z.string().regex(/^\+?[0-9\s-]{7,20}$/, 'Teléfono inválido').or(z.literal('')).optional(),
  notes: z.string().max(1000, 'Máximo 1000 caracteres').or(z.literal('')).optional(),
});

type FormValues = z.infer<typeof schema>;

type Props = {
  client?: Client;
  onSubmit: (input: ClientInput) => Promise<void> | void;
  onCancel: () => void;
};

export function ClienteForm({ client, onSubmit, onCancel }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: client?.name ?? '',
      contact_email: client?.contact_email ?? '',
      phone: client?.phone ?? '',
      notes: client?.notes ?? '',
    },
  });

  async function handle(values: FormValues) {
    const input: ClientInput = {
      name: values.name,
      contact_email: values.contact_email,
      ...(values.phone ? { phone: values.phone } : {}),
      ...(values.notes ? { notes: values.notes } : {}),
    };
    await onSubmit(input);
  }

  return (
    <form onSubmit={handleSubmit(handle)} className="space-y-4">
      <div>
        <label htmlFor="name" className="block mb-1">Nombre</label>
        <input id="name" {...register('name')} className="border w-full p-2 rounded" />
        {errors.name && <p className="text-red-600 text-sm">{errors.name.message}</p>}
      </div>

      <div>
        <label htmlFor="contact_email" className="block mb-1">Email de contacto</label>
        <input id="contact_email" type="email" {...register('contact_email')} className="border w-full p-2 rounded" />
        {errors.contact_email && <p className="text-red-600 text-sm">{errors.contact_email.message}</p>}
      </div>

      <div>
        <label htmlFor="phone" className="block mb-1">Teléfono (opcional)</label>
        <input id="phone" type="tel" {...register('phone')} className="border w-full p-2 rounded" />
        {errors.phone && <p className="text-red-600 text-sm">{errors.phone.message}</p>}
      </div>

      <div>
        <label htmlFor="notes" className="block mb-1">Notas (opcional)</label>
        <textarea id="notes" {...register('notes')} className="border w-full p-2 rounded" rows={4} maxLength={1000} />
        {errors.notes && <p className="text-red-600 text-sm">{errors.notes.message}</p>}
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

Run: `npm run test:run -- src/features/clientes/ClienteForm.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/clientes/ClienteForm.tsx src/features/clientes/ClienteForm.test.tsx
git commit -m "feat(clients): ClienteForm RHF+Zod para alta y edicion"
```

---

### Task 4: Componente `ClientesTable` (tabla pura)

**Files:**
- Create: `src/features/clientes/ClientesTable.tsx`
- Test: `src/features/clientes/ClientesTable.test.tsx`

- [ ] **Step 1: Escribir el test primero `src/features/clientes/ClientesTable.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ClientesTable } from './ClientesTable';
import type { Client } from './types';

const base: Client = {
  id: 'c1', company_id: 'co', name: 'Bodega X', contact_email: 'info@bodega.com',
  phone: '912345678', notes: null, created_at: '2026-05-19T10:00:00Z', archived_at: null,
};

const callbacks = { onEdit: vi.fn(), onArchive: vi.fn(), onRestore: vi.fn() };

describe('ClientesTable', () => {
  it('shows empty state when clients is empty', () => {
    render(<ClientesTable clients={[]} {...callbacks} />);
    expect(screen.getByText(/sin clientes/i)).toBeInTheDocument();
  });

  it('renders one row per client with name, email and phone', () => {
    render(<ClientesTable clients={[base, { ...base, id: 'c2', name: 'Bodega Y' }]} {...callbacks} />);
    expect(screen.getByText('Bodega X')).toBeInTheDocument();
    expect(screen.getByText('Bodega Y')).toBeInTheDocument();
    expect(screen.getByText('info@bodega.com')).toBeInTheDocument();
    expect(screen.getByText('912345678')).toBeInTheDocument();
  });

  it('shows Editar and Archivar for active clients', () => {
    render(<ClientesTable clients={[base]} {...callbacks} />);
    expect(screen.getByRole('button', { name: /editar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /archivar/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /restaurar/i })).not.toBeInTheDocument();
  });

  it('shows only Restaurar for archived clients', () => {
    render(<ClientesTable clients={[{ ...base, archived_at: '2026-05-19T12:00:00Z' }]} {...callbacks} />);
    expect(screen.queryByRole('button', { name: /editar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /archivar/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /restaurar/i })).toBeInTheDocument();
  });

  it('calls onEdit with the client object', async () => {
    const fns = { ...callbacks, onEdit: vi.fn() };
    render(<ClientesTable clients={[base]} {...fns} />);
    await userEvent.click(screen.getByRole('button', { name: /editar/i }));
    expect(fns.onEdit).toHaveBeenCalledWith(base);
  });

  it('calls onArchive with client id', async () => {
    const fns = { ...callbacks, onArchive: vi.fn() };
    render(<ClientesTable clients={[base]} {...fns} />);
    await userEvent.click(screen.getByRole('button', { name: /archivar/i }));
    expect(fns.onArchive).toHaveBeenCalledWith('c1');
  });

  it('calls onRestore with client id', async () => {
    const fns = { ...callbacks, onRestore: vi.fn() };
    render(<ClientesTable clients={[{ ...base, archived_at: '2026-05-19T12:00:00Z' }]} {...fns} />);
    await userEvent.click(screen.getByRole('button', { name: /restaurar/i }));
    expect(fns.onRestore).toHaveBeenCalledWith('c1');
  });
});
```

- [ ] **Step 2: Correr el test (debe fallar)**

Run: `npm run test:run -- src/features/clientes/ClientesTable.test.tsx`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Implementar `src/features/clientes/ClientesTable.tsx`**

```tsx
import type { Client } from './types';

type Props = {
  clients: Client[];
  onEdit: (client: Client) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
};

export function ClientesTable({ clients, onEdit, onArchive, onRestore }: Props) {
  if (clients.length === 0) {
    return <p className="text-gray-500 py-8 text-center">Sin clientes en esta vista.</p>;
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left">
          <th className="py-2 pr-4">Nombre</th>
          <th className="py-2 pr-4">Email de contacto</th>
          <th className="py-2 pr-4">Teléfono</th>
          <th className="py-2">Acciones</th>
        </tr>
      </thead>
      <tbody>
        {clients.map((c) => {
          const archived = c.archived_at !== null;
          return (
            <tr key={c.id} className="border-b">
              <td className="py-2 pr-4">{c.name}</td>
              <td className="py-2 pr-4">{c.contact_email}</td>
              <td className="py-2 pr-4">{c.phone ?? '—'}</td>
              <td className="py-2 space-x-2">
                {archived ? (
                  <button type="button" className="text-green-700 underline" onClick={() => onRestore(c.id)}>Restaurar</button>
                ) : (
                  <>
                    <button type="button" className="text-blue-600 underline" onClick={() => onEdit(c)}>Editar</button>
                    <button type="button" className="text-gray-700 underline" onClick={() => onArchive(c.id)}>Archivar</button>
                  </>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: Correr el test (debe pasar)**

Run: `npm run test:run -- src/features/clientes/ClientesTable.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/clientes/ClientesTable.tsx src/features/clientes/ClientesTable.test.tsx
git commit -m "feat(clients): ClientesTable con acciones contextuales"
```

---

### Task 5: Orquestador `ClientesList` + refactor de la ruta

**Files:**
- Create: `src/features/clientes/ClientesList.tsx`
- Modify: `src/routes/admin/clientes.tsx`
- Test: `src/features/clientes/ClientesList.test.tsx`

- [ ] **Step 1: Escribir el test primero `src/features/clientes/ClientesList.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('./api', () => ({
  listClients: vi.fn(),
  createClient: vi.fn(),
  updateClient: vi.fn(),
  archiveClient: vi.fn(),
  restoreClient: vi.fn(),
}));

import { listClients, createClient, archiveClient, restoreClient } from './api';
import { ClientesList } from './ClientesList';
import type { Client } from './types';

function mkClient(over: Partial<Client> = {}): Client {
  return {
    id: crypto.randomUUID(), company_id: 'co',
    name: 'Bodega X', contact_email: 'info@x.com', phone: null, notes: null,
    created_at: '2026-05-19T10:00:00Z', archived_at: null,
    ...over,
  };
}

beforeEach(() => {
  vi.mocked(listClients).mockReset();
  vi.mocked(createClient).mockReset();
  vi.mocked(archiveClient).mockReset();
  vi.mocked(restoreClient).mockReset();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('ClientesList', () => {
  it('loads and renders active clients', async () => {
    vi.mocked(listClients).mockResolvedValue([mkClient({ name: 'Bodega X' })]);
    render(<ClientesList />);
    expect(await screen.findByText('Bodega X')).toBeInTheDocument();
  });

  it('hides archived clients by default, shows them with toggle', async () => {
    vi.mocked(listClients).mockResolvedValue([
      mkClient({ name: 'Activa' }),
      mkClient({ name: 'Archivada', archived_at: '2026-05-19T12:00:00Z' }),
    ]);
    render(<ClientesList />);
    await screen.findByText('Activa');
    expect(screen.queryByText('Archivada')).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(/mostrar archivados/i));
    expect(await screen.findByText('Archivada')).toBeInTheDocument();
    expect(screen.queryByText('Activa')).not.toBeInTheDocument();
  });

  it('filters by search term (name or email)', async () => {
    vi.mocked(listClients).mockResolvedValue([
      mkClient({ name: 'Bodega X', contact_email: 'x@x.com' }),
      mkClient({ name: 'Ayuntamiento', contact_email: 'town@y.com' }),
    ]);
    render(<ClientesList />);
    await screen.findByText('Bodega X');
    await userEvent.type(screen.getByPlaceholderText(/buscar/i), 'town');
    expect(screen.getByText('Ayuntamiento')).toBeInTheDocument();
    expect(screen.queryByText('Bodega X')).not.toBeInTheDocument();
  });

  it('opens create modal on "+ Nuevo cliente" and creates', async () => {
    vi.mocked(listClients)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([mkClient({ name: 'Nueva' })]);
    vi.mocked(createClient).mockResolvedValue(undefined);
    render(<ClientesList />);
    await screen.findByText(/sin clientes/i);
    await userEvent.click(screen.getByRole('button', { name: /nuevo cliente/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/nombre/i), 'Nueva');
    await userEvent.type(screen.getByLabelText(/email de contacto/i), 'n@n.com');
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await vi.waitFor(() => expect(createClient).toHaveBeenCalledWith({ name: 'Nueva', contact_email: 'n@n.com' }));
    await vi.waitFor(() => expect(listClients).toHaveBeenCalledTimes(2));
  });

  it('archives a client with confirm and refetches', async () => {
    const c = mkClient({ name: 'Bodega X' });
    vi.mocked(listClients)
      .mockResolvedValueOnce([c])
      .mockResolvedValueOnce([{ ...c, archived_at: '2026-05-19T12:00:00Z' }]);
    vi.mocked(archiveClient).mockResolvedValue(undefined);
    render(<ClientesList />);
    await screen.findByText('Bodega X');
    await userEvent.click(screen.getByRole('button', { name: /archivar/i }));
    expect(window.confirm).toHaveBeenCalled();
    expect(archiveClient).toHaveBeenCalledWith(c.id);
    await vi.waitFor(() => expect(listClients).toHaveBeenCalledTimes(2));
  });

  it('restores an archived client and refetches', async () => {
    const c = mkClient({ name: 'Archivada', archived_at: '2026-05-19T12:00:00Z' });
    vi.mocked(listClients)
      .mockResolvedValueOnce([c])
      .mockResolvedValueOnce([{ ...c, archived_at: null }]);
    vi.mocked(restoreClient).mockResolvedValue(undefined);
    render(<ClientesList />);
    await userEvent.click(await screen.findByLabelText(/mostrar archivados/i));
    await userEvent.click(await screen.findByRole('button', { name: /restaurar/i }));
    expect(restoreClient).toHaveBeenCalledWith(c.id);
    await vi.waitFor(() => expect(listClients).toHaveBeenCalledTimes(2));
  });

  it('shows error banner when listClients throws', async () => {
    vi.mocked(listClients).mockRejectedValue(new Error('rls denied'));
    render(<ClientesList />);
    expect(await screen.findByText(/error al cargar/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr el test (debe fallar)**

Run: `npm run test:run -- src/features/clientes/ClientesList.test.tsx`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Implementar `src/features/clientes/ClientesList.tsx`**

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from '../../components/Modal';
import { ClientesTable } from './ClientesTable';
import { ClienteForm } from './ClienteForm';
import { archiveClient, createClient, listClients, restoreClient, updateClient, type ClientInput } from './api';
import type { Client } from './types';

type ModalState =
  | { kind: 'closed' }
  | { kind: 'create' }
  | { kind: 'edit'; client: Client };

export function ClientesList() {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [modal, setModal] = useState<ModalState>({ kind: 'closed' });

  const refetch = useCallback(async () => {
    setError(null);
    try {
      setClients(await listClients());
    } catch (e) {
      setError(String(e));
      setClients([]);
    }
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  const visible = useMemo(() => {
    if (!clients) return [];
    const term = search.trim().toLowerCase();
    return clients
      .filter((c) => (showArchived ? c.archived_at !== null : c.archived_at === null))
      .filter((c) => {
        if (!term) return true;
        return c.name.toLowerCase().includes(term) || c.contact_email.toLowerCase().includes(term);
      });
  }, [clients, search, showArchived]);

  async function handleSubmit(input: ClientInput) {
    setActionError(null);
    try {
      if (modal.kind === 'edit') await updateClient(modal.client.id, input);
      else await createClient(input);
      setModal({ kind: 'closed' });
      await refetch();
    } catch (e) {
      setActionError(String(e));
    }
  }

  async function handleArchive(id: string) {
    if (!window.confirm('¿Archivar este cliente?')) return;
    setActionError(null);
    try {
      await archiveClient(id);
      await refetch();
    } catch (e) { setActionError(String(e)); }
  }

  async function handleRestore(id: string) {
    setActionError(null);
    try {
      await restoreClient(id);
      await refetch();
    } catch (e) { setActionError(String(e)); }
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-4">
        <input
          type="text"
          placeholder="Buscar por nombre o email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border p-2 rounded w-full max-w-sm"
        />
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Mostrar archivados
        </label>
        <button
          type="button"
          onClick={() => setModal({ kind: 'create' })}
          className="ml-auto bg-black text-white px-4 py-2 rounded"
        >
          + Nuevo cliente
        </button>
      </div>

      {error && <p className="text-red-600 mb-4">Error al cargar clientes: {error}</p>}
      {actionError && <p className="text-red-600 mb-4">{actionError}</p>}

      {clients === null && !error ? (
        <p className="text-gray-500">Cargando…</p>
      ) : (
        <ClientesTable
          clients={visible}
          onEdit={(client) => setModal({ kind: 'edit', client })}
          onArchive={handleArchive}
          onRestore={handleRestore}
        />
      )}

      <Modal
        open={modal.kind !== 'closed'}
        onClose={() => setModal({ kind: 'closed' })}
        title={modal.kind === 'edit' ? 'Editar cliente' : 'Nuevo cliente'}
      >
        {modal.kind !== 'closed' && (
          <ClienteForm
            client={modal.kind === 'edit' ? modal.client : undefined}
            onSubmit={handleSubmit}
            onCancel={() => setModal({ kind: 'closed' })}
          />
        )}
      </Modal>
    </div>
  );
}
```

- [ ] **Step 4: Refactor `src/routes/admin/clientes.tsx`**

```tsx
import { ClientesList } from '../../features/clientes/ClientesList';

export default function AdminClientes() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Clientes</h1>
      <ClientesList />
    </div>
  );
}
```

- [ ] **Step 5: Correr los tests del orquestador (deben pasar)**

Run: `npm run test:run -- src/features/clientes/ClientesList.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 6: Correr toda la suite + build para verificar no regresiones**

Run: `npm run test:run`
Expected: todos PASS (los nuevos + los existentes de Fase 1).

Run: `npm run build`
Expected: build OK.

- [ ] **Step 7: Commit**

```bash
git add src/features/clientes/ClientesList.tsx src/features/clientes/ClientesList.test.tsx src/routes/admin/clientes.tsx
git commit -m "feat(clients): ClientesList orquestador + refactor ruta /admin/clientes"
```

---

### Task 6: Tests pgTAP de RLS, default de company_id y audit

**Files:**
- Create: `supabase/tests/clients_rls.sql`
- Create: `supabase/tests/clients_company_default.sql`
- Create: `supabase/tests/clients_audit_attached.sql`

Nota: estos tests requieren una BD con la migración aplicada. Si Docker está disponible, se corren con `npx supabase test db`. Si no, se aplican y validan contra la BD cloud tras `npx supabase db push` (paso de despliegue final). Escríbelos y commitéalos; la ejecución se documenta en los pasos finales.

- [ ] **Step 1: Crear `supabase/tests/clients_rls.sql`**

```sql
-- Verifica aislamiento multi-tenant en clients:
-- 1) Admin A solo ve sus clientes.
-- 2) El WITH CHECK rechaza INSERT con company_id ajeno.

begin;
select plan(3);

-- Setup como superuser (antes de impersonar)
insert into auth.users (id, email, encrypted_password, email_confirmed_at) values
  ('11111111-1111-1111-1111-111111111111', 'admina@a.com', '', now()),
  ('22222222-2222-2222-2222-222222222222', 'adminb@b.com', '', now());

insert into public.companies (id, name, slug) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Empresa A', 'empresa-a-cli'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Empresa B', 'empresa-b-cli');

insert into public.admin_users (id, company_id, email, full_name) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admina@a.com', 'Admin A'),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'adminb@b.com', 'Admin B');

insert into public.clients (company_id, name, contact_email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Cliente A', 'a@cli.com'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Cliente B', 'b@cli.com');

-- Impersonar Admin A
set local role authenticated;
set local "request.jwt.claims" to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","company_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';

-- Test 1: Admin A solo ve su cliente
select results_eq(
  $$ select count(*)::int from public.clients $$,
  $$ values (1) $$,
  'admin A only sees own company clients'
);

-- Test 2: Admin A no ve el cliente de B por email
select results_eq(
  $$ select count(*)::int from public.clients where contact_email = 'b@cli.com' $$,
  $$ values (0) $$,
  'admin A cannot see company B client'
);

-- Test 3: WITH CHECK rechaza INSERT con company_id ajeno
select throws_ok(
  $$ insert into public.clients (company_id, name, contact_email)
     values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Intruso', 'x@x.com') $$,
  '42501',
  'new row violates row-level security policy for table "clients"',
  'WITH CHECK blocks INSERT with foreign company_id'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Crear `supabase/tests/clients_company_default.sql`**

```sql
-- Verifica que el default de company_id rellena el valor desde el claim
-- JWT cuando el INSERT no lo especifica (caso del SPA admin).

begin;
select plan(1);

-- Setup como superuser
insert into auth.users (id, email, encrypted_password, email_confirmed_at) values
  ('33333333-3333-3333-3333-333333333333', 'def@a.com', '', now());

insert into public.companies (id, name, slug) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Default Co', 'default-co-cli');

insert into public.admin_users (id, company_id, email, full_name) values
  ('33333333-3333-3333-3333-333333333333', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'def@a.com', 'Def');

-- Impersonar admin de Default Co
set local role authenticated;
set local "request.jwt.claims" to
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","company_id":"cccccccc-cccc-cccc-cccc-cccccccccccc"}';

-- INSERT sin company_id → el default lo rellena del claim
insert into public.clients (name, contact_email) values ('Sin Company', 's@s.com');

select results_eq(
  $$ select company_id from public.clients where contact_email = 's@s.com' $$,
  $$ values ('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid) $$,
  'company_id default fills from JWT claim on INSERT without company_id'
);

select * from finish();
rollback;
```

- [ ] **Step 3: Crear `supabase/tests/clients_audit_attached.sql`**

```sql
-- Verifica que el trigger log_audit_event audita mutaciones en clients
-- con action correcto, diff coherente y actor_id poblado desde el claim.

begin;
select plan(4);

-- Setup como superuser
insert into auth.users (id, email, encrypted_password, email_confirmed_at) values
  ('55555555-5555-5555-5555-555555555555', 'audit-cli@a.com', '', now());

insert into public.companies (id, name, slug) values
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'Audit Cli Co', 'audit-cli-co');

insert into public.admin_users (id, company_id, email, full_name) values
  ('55555555-5555-5555-5555-555555555555', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'audit-cli@a.com', 'Audit');

-- Impersonar el admin (para que auth.uid() pueble actor_id)
set local role authenticated;
set local "request.jwt.claims" to
  '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated","company_id":"dddddddd-dddd-dddd-dddd-dddddddddddd"}';

-- INSERT
insert into public.clients (id, name, contact_email)
values ('66666666-6666-6666-6666-666666666666', 'Audit Cliente', 'ac@x.com');

select results_eq(
  $$ select action from public.audit_log
     where entity_id = '66666666-6666-6666-6666-666666666666'
       and action like 'clients.%'
     order by created_at $$,
  $$ values ('clients.insert'::text) $$,
  'INSERT on clients produces clients.insert audit row'
);

select ok(
  exists(
    select 1 from public.audit_log
    where entity_id = '66666666-6666-6666-6666-666666666666'
      and action = 'clients.insert'
      and diff -> 'after' ->> 'contact_email' = 'ac@x.com'
      and actor_id = '55555555-5555-5555-5555-555555555555'
  ),
  'INSERT audit captures email and actor_id from claim'
);

-- UPDATE
update public.clients set name = 'Renombrado' where id = '66666666-6666-6666-6666-666666666666';

select ok(
  exists(
    select 1 from public.audit_log
    where entity_id = '66666666-6666-6666-6666-666666666666'
      and action = 'clients.update'
      and diff -> 'before' ->> 'name' = 'Audit Cliente'
      and diff -> 'after' ->> 'name' = 'Renombrado'
  ),
  'UPDATE audit captures name change'
);

-- DELETE
delete from public.clients where id = '66666666-6666-6666-6666-666666666666';

select ok(
  exists(
    select 1 from public.audit_log
    where entity_id = '66666666-6666-6666-6666-666666666666'
      and action = 'clients.delete'
  ),
  'DELETE on clients produces clients.delete audit row'
);

select * from finish();
rollback;
```

- [ ] **Step 4: (Si Docker disponible) correr los tests pgTAP**

Run: `npx supabase test db`
Expected: los 3 tests nuevos pasan junto con los existentes.

Si Docker NO está disponible: saltar este paso. Los tests se validarán contra cloud tras aplicar la migración (pasos finales).

- [ ] **Step 5: Commit**

```bash
git add supabase/tests/clients_rls.sql supabase/tests/clients_company_default.sql supabase/tests/clients_audit_attached.sql
git commit -m "test(clients): pgTAP RLS, company_id default y audit trigger"
```

---

## Pasos finales (fuera de subagent-driven; controlador/usuario los hacen)

1. **Aplicar migración a cloud**: `npx supabase db push` (PEDIR CONFIRMACIÓN AL USUARIO antes — modifica la BD de producción/staging). Esto crea la tabla `clients` en cloud.
2. **(Si Docker no disponible) validar pgTAP contra cloud** o confiar en el smoke manual + tests Vitest.
3. **Push del feature branch** (PEDIR CONFIRMACIÓN).
4. **PR feat → develop** → Cloudflare construye preview.
5. **Smoke E2E manual** (spec §6.3) contra el preview.
6. **PR develop → main** tras OK.
7. **Mergear** la rama `docs/m2-phase-2-clients-spec` (spec) en el mismo flujo.
8. Sin tag intermedio: el tag `v0.x.0-m2` llega al cerrar Fase 3.

## Self-review checklist (controlador)

Tras ejecutar todas las tasks:
- [ ] Spec coverage: cada criterio de aceptación §7 del spec tiene test o queda en el smoke manual.
- [ ] Sin TODOs ni placeholders en el código entregado.
- [ ] Consistencia de tipos: `Client`, `ClientInput` importados de un único lugar; nombres de funciones API coinciden entre `api.ts`, tests y `ClientesList`.
- [ ] `npm run build` y `npm run test:run` verdes.
- [ ] La migración `clients` aplicada en cloud antes del smoke.
