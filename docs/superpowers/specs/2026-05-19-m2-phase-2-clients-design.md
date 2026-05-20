# M2 Fase 2 — Clientes (CRUD admin): Diseño

**Fecha**: 2026-05-19
**Estado**: Spec aprobado, pendiente de plan de implementación
**Predecesores**:
- `2026-05-16-checkin-app-design.md` (spec maestro)
- `2026-05-17-m2-agenda-eventos-design.md` (spec M2 global)
- `2026-05-17-m2-phase-1b-workers-frontend-design.md` (patrón de UI a replicar)

## 1. Contexto y objetivo

Fase 2 entrega el **CRUD del catálogo de clientes finales** de cada empresa. Un cliente es la entidad para la que se organiza un evento (ej. "Bodega X", "Ayuntamiento de Y"). En Fase 3 los eventos referenciarán a estos clientes (`events.client_id`), así que tener el catálogo es prerequisito.

A diferencia de workers (Fase 1), clientes es **CRUD puro de administración**:
- Sin flujo público.
- Sin Edge Functions.
- Sin email.
- Mutaciones directas vía supabase-js desde el SPA, protegidas por RLS y auditadas por el trigger genérico `log_audit_event` (Fase 0).

Al cerrar Fase 2: un admin puede crear, editar, archivar y restaurar clientes de su empresa, con búsqueda y aislamiento multi-tenant.

### Decisiones cerradas en brainstorm

- **Form**: modal (reutiliza el `Modal` genérico), sirve para alta y edición. No página dedicada.
- **Restaurar**: sí. Un cliente archivado se puede reactivar con un botón (a diferencia de workers, que archivar era one-way en 1b).
- **company_id en INSERT**: column default `(auth.jwt() ->> 'company_id')::uuid` + RLS `WITH CHECK`. El frontend no maneja company_id.
- **Sin "Ver ficha" read-only**: el cliente tiene pocos campos; `Editar` ya los muestra todos. YAGNI.
- **Sin optimistic UI**: refetch tras mutación, igual que AgendaTabs.

### Fuera de alcance (deferido)

- Eventos y su relación con clientes → Fase 3.
- Campos pre-producción real (DNI/CIF, dirección fiscal) → memoria `project_pre_production_data_extensions`.
- Bulk actions, import/export, paginación/virtualización (innecesario a estas escalas).
- Hard delete (solo soft delete vía `archived_at`).

## 2. Modelo de datos

Migración nueva (la tabla `clients` no existe todavía; en Fase 1a solo se creó `workers`).

```sql
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

### Notas sobre el modelo

- **`company_id default (auth.jwt() ->> 'company_id')::uuid`**: el INSERT viene del SPA con la sesión del admin. `auth.jwt()` está disponible en el contexto de PostgREST, así que el default rellena el tenant automáticamente. El frontend nunca envía `company_id`.
- **`WITH CHECK` explícito en la policy**: a diferencia de `workers` (cuyo INSERT venía de service_role en Edge Function, donde `USING` bastaba), aquí el INSERT viene del cliente autenticado. El `WITH CHECK` garantiza que ni un cliente malicioso puede insertar/actualizar filas con `company_id` ajeno, aunque manipule el payload.
- **`contact_email not null`**: todo cliente tiene un email de contacto (lo usaremos en Fase 3 para pre-rellenar el `organizer_email` del evento).
- **Índice parcial `where archived_at is null`**: optimiza el listado por defecto (clientes activos).
- **Sin UNIQUE sobre nombre**: dos clientes pueden llamarse igual (ej. dos sucursales). No forzamos unicidad.
- **`on delete cascade` desde companies**: si se borra una empresa, sus clientes se borran. Coherente con el resto del schema.
- **Audit**: el trigger genérico `log_audit_event` (Fase 0) resuelve `company_id` desde `NEW/OLD.company_id` y registra `action = 'clients.{insert|update|delete}'` con diff jsonb.

## 3. Estructura frontend

Mismo patrón que `features/workers/`. Archivos nuevos:

```
src/
├── features/clientes/
│   ├── types.ts            ← Client type
│   ├── api.ts              ← list/create/update/archive/restore
│   ├── ClientesList.tsx    ← orquestador: carga, búsqueda, toggle, modales (≈ AgendaTabs)
│   ├── ClientesTable.tsx   ← tabla pura con acciones contextuales (≈ AgendaTable)
│   └── ClienteForm.tsx     ← form RHF+Zod dentro del Modal (alta + edición)
├── routes/admin/clientes.tsx  ← refactor del placeholder → monta <ClientesList/>
└── types/database.ts          ← añadir tabla `clients` (igual que se hizo con workers)
```

Reutiliza `src/components/Modal.tsx`. Sin tocar otras features.

### Tipo `Client`

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

Tipo local en `features/clientes/types.ts` + entrada en `database.ts` para que supabase-js tipe `.from('clients')`. (Regen formal de `database.ts` queda para el cierre de M2, como con workers.)

## 4. API layer

`features/clientes/api.ts` — wrappers directos sobre supabase-js. No usan el patrón Result discriminado de las Edge Functions porque no hay errores de negocio tipados: lanzan `Error` y el componente captura para el banner.

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

## 5. Componentes y flujo

### 5.1 `ClienteForm` (dentro del Modal)

RHF + Zod. Sirve para alta (sin `defaultValues`) y edición (prefilled con un `Client`).

**Schema:**
```ts
const schema = z.object({
  name: z.string().min(1, 'Obligatorio'),
  contact_email: z.string().min(1, 'Obligatorio').email('Email inválido'),
  phone: z.string().regex(/^\+?[0-9\s-]{7,20}$/, 'Teléfono inválido').or(z.literal('')).optional(),
  notes: z.string().max(1000, 'Máximo 1000 caracteres').or(z.literal('')).optional(),
});
```

Phone más lenient que workers (permite espacios y guiones) porque son teléfonos de empresa que el admin teclea con formato. Al hacer submit, los campos opcionales vacíos se omiten del payload (no se mandan como `''`).

### 5.2 `ClientesTable` (tabla pura)

Recibe `clients: Client[]` y callbacks. No llama a la API. Columnas: Nombre, Email de contacto, Teléfono, Acciones.

**Acciones por fila (según `archived_at`):**
- Activo (`archived_at === null`): `Editar` | `Archivar`
- Archivado: `Restaurar`

Empty state cuando la lista filtrada está vacía.

### 5.3 `ClientesList` (orquestador)

Mismo patrón que `AgendaTabs`:
- Carga con `listClients()` en mount → `useState<Client[] | null>`.
- Toggle "Mostrar archivados": filtra `archived_at IS NULL` (off) vs `archived_at IS NOT NULL` (on).
- Búsqueda: input que filtra client-side por `name`/`contact_email` (case-insensitive substring).
- Botón "+ Nuevo cliente" → abre Modal con `ClienteForm` vacío.
- `Editar` → abre Modal con `ClienteForm` prefilled.
- `Archivar`/`Restaurar` → `window.confirm` para archivar (acción destructiva); restaurar va directo.
- Tras cualquier mutación → `refetch()`.
- Banner de error rojo si la carga o una mutación falla.

### 5.4 Ruta `/admin/clientes`

Refactor del placeholder actual a:

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

## 6. Testing

### 6.1 Frontend (Vitest + RTL)

- `features/clientes/api.test.ts` — wrappers llaman a supabase-js con los argumentos correctos y propagan errores. Mocks de supabase.
- `features/clientes/ClienteForm.test.tsx` — validación de cada campo (name/email requeridos, phone regex, notes max 1000); submit normaliza payload omitiendo opcionales vacíos; modo edición prefilla los campos.
- `features/clientes/ClientesTable.test.tsx` — empty state; render de filas con nombre/email/teléfono; acciones contextuales (Editar/Archivar para activos, Restaurar para archivados); callbacks con id correcto.
- `features/clientes/ClientesList.test.tsx` — carga inicial; búsqueda filtra; toggle archivados cambia el set visible; abrir modal de alta y de edición; mutaciones llaman refetch; banner de error cuando listClients lanza.

### 6.2 pgTAP (DB)

- `clients_rls.sql` — aislamiento por tenant: admin de empresa A no ve, no inserta, no actualiza, no archiva clientes de empresa B; el `WITH CHECK` rechaza INSERT/UPDATE con `company_id` ajeno.
- `clients_company_default.sql` — INSERT sin especificar `company_id` rellena el valor desde el claim JWT del que ejecuta.
- `clients_audit_attached.sql` — INSERT/UPDATE/DELETE sobre clients dispara fila en `audit_log` con `action = 'clients.{insert|update|delete}'`, `company_id` correcto, `diff` con before/after según corresponda, y `actor_id` poblado (la mutación viene de un admin autenticado, no de service_role).

### 6.3 Smoke E2E manual (pre-merge a main)

1. Crear cliente con todos los campos → aparece en la lista ordenado por nombre.
2. Crear cliente solo con name + contact_email (opcionales vacíos) → OK, sin enviar strings vacíos.
3. Validación: nombre vacío, email inválido, teléfono con letras, notas >1000 → errores inline.
4. Editar un cliente → cambios persisten tras refetch.
5. Buscar por trozo de nombre y por email → filtra correctamente.
6. Archivar (confirm dialog) → desaparece de la lista por defecto.
7. Toggle "Mostrar archivados" → reaparece con acción Restaurar.
8. Restaurar → vuelve a la lista activa.
9. Cross-tenant: admin de otra empresa no ve estos clientes.

## 7. Criterios de aceptación

- [ ] Migración `clients` aplicada en cloud con RLS, default de company_id, índice parcial y trigger de audit.
- [ ] `/admin/clientes` lista los clientes del tenant ordenados por nombre.
- [ ] "+ Nuevo cliente" abre modal; alta válida crea el cliente y refresca la lista.
- [ ] Validación inline: name requerido, contact_email requerido + formato, phone lenient opcional, notes máx 1000.
- [ ] Editar abre el modal prefilled; guardar persiste cambios.
- [ ] Archivar (con confirm) saca el cliente de la vista por defecto.
- [ ] Toggle "Mostrar archivados" muestra los archivados con botón Restaurar.
- [ ] Restaurar reactiva el cliente.
- [ ] Búsqueda filtra por nombre y email (case-insensitive).
- [ ] Empty state en lista vacía; banner de error si falla la carga/mutación.
- [ ] Aislamiento cross-tenant verificado (pgTAP + smoke manual).
- [ ] Audit log poblado en cada mutación.
- [ ] Tests Vitest + pgTAP verdes.
- [ ] Smoke E2E manual completo contra preview, luego producción.
- [ ] Merge a main + (no hace falta tag intermedio; el tag de M2 completo llega tras Fase 3).

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| El default `auth.jwt() ->> 'company_id'` es NULL si el admin no tiene el claim (sesión vieja pre-hook) | El claim lo inyecta el Auth Hook desde Fase 0. Sesiones nuevas siempre lo llevan. Si una sesión vieja falla, el `not null` de company_id rechaza el INSERT con error claro → el admin re-loguea. Documentado en smoke. |
| Cliente archivado con eventos asociados (Fase 3) | No aplica en Fase 2 (no hay eventos). En Fase 3, `events.client_id` será `ON DELETE RESTRICT` y los eventos referenciarán al cliente aunque esté archivado; el archivado es soft, la fila persiste. |
| `database.ts` sin `clients` rompe el build TS | Añadir `clients` manualmente a `database.ts` en la primera tarea (mismo enfoque validado con workers). |
| Phone lenient deja pasar formatos raros | Aceptable: es un campo informativo de contacto, no se usa para envíos automáticos. Validación mínima evita basura obvia. |

## 9. No-objetivos explícitos

- No tocar `features/workers/`, `eventos.tsx`, `reportes.tsx`, `auditoria.tsx`.
- No introducir React Query, Zustand ni librerías de UI.
- No añadir paginación, ordenación por columnas, ni filtros avanzados.
- No añadir vista read-only separada (Editar cubre la visualización).
