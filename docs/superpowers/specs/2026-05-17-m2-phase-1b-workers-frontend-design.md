# M2 Fase 1b — Workers frontend: Diseño

**Fecha**: 2026-05-17
**Estado**: Spec aprobado, pendiente de plan de implementación
**Predecesores**:
- `2026-05-16-checkin-app-design.md` (spec maestro)
- `2026-05-17-m2-agenda-eventos-design.md` (spec M2 global)
- `2026-05-17-m2-phase-1a-workers-backend-design.md` (backend ya desplegado)

## 1. Contexto y objetivo

Fase 1a dejó listo todo el server-side del ciclo de workers (schema `workers`, 4 Edge Functions, Resend integrado con white-label, audit trigger, tests). Fase 1b conecta esa lógica con la UI y **cierra el ciclo end-to-end** del registro y aprobación de candidatos.

Al completar 1b:

- Un candidato puede abrir `/candidato/registro?company=<slug>`, rellenar el formulario, recibir el email de verificación, hacer click y ver una pantalla de confirmación.
- Un admin entra en `/admin/agenda`, ve dos pestañas (Aprobados / Pendientes), puede aprobar/rechazar/archivar candidatos y ver su ficha completa en un modal.
- El comportamiento de honeypot, token expirado, duplicado idempotente, etc. queda cubierto por la UI con mensajes en castellano.

Tras 1b, el flujo M2 Fase 1 queda terminado y bloqueado contra producción mediante `v0.2.0-m2-fase-1`.

### Decisiones cerradas en brainstorm

- **Scope**: un único Fase 1b (público + admin) en un solo PR. Splittear sólo cierra mitad del ciclo y no es testeable end-to-end.
- **Form público**: single-page, sin wizard. Coherente con el principio "formularios simples, single-page, sin wizards" del spec maestro.
- **Idiomas**: checkboxes simples (sin combobox fancy). Lista fija de la enum del backend.
- **Pantalla `/candidato/registro-enviado`**: existe (es paso 5 del flujo del spec global). No la fusionamos con `/gracias` (significados distintos: "email enviado, revísalo" vs "ya estás registrado").
- **Pantalla `/candidato/verificar`**: dispara la verificación al montar, muestra el resultado en la misma página. No redirige a `/gracias` para no perder el `company_name` en un refresh y para que la URL del enlace en el email sea estable.
- **Pantalla `/candidato/gracias`**: opcional. **Decidido NO crearla en 1b**: el spec habla de mostrar la confirmación tras verificar; el contenido encaja en `/verificar` mismo (loading → resultado). Una pantalla extra solo añade routing y un estado huérfano en refresh. Si más tarde necesitamos separarla, es un refactor barato.
- **Panel admin**: 2 pestañas (Aprobados default, Pendientes con badge) + toggle "Mostrar archivados". Exactamente lo que dice el spec global §4.3.
- **Ficha de worker**: **modal** dentro de la pestaña, no ruta separada. Mantiene contexto del filtro/búsqueda y evita gestionar `/admin/agenda/:worker_id`. El spec global mencionaba esa ruta pero la propia descripción ("Ver ficha") cabe perfectamente en un modal.
- **Aprobar**: llama Edge Function `approve-worker` (manda email).
- **Rechazar**: UPDATE directo vía supabase-js — setea `status='rejected'` **Y** `archived_at=now()` en la misma operación. Esto evita que el rechazado se vuelva invisible (sin tab propio) y libera el email para que el candidato pueda volver a aplicar tras la decisión.
- **Archivar**: UPDATE directo vía supabase-js (`archived_at=now()`), `status` se conserva (un aprobado archivado sigue mostrando `status='approved'` en su ficha). One-way en 1b (sin botón "Restaurar"; el toggle "Mostrar archivados" permite verlos).
- **Confirmaciones destructivas**: `window.confirm()` para rechazar/archivar. Modal custom solo para "Ver ficha". Acepto la falta de estilo a cambio de cero código.
- **Búsqueda**: filtrado client-side sobre el array ya cargado del tab (escala holgada a 100s de workers por tenant).
- **Data fetching**: sin React Query (no está en el stack). `useEffect` + función `refetch()` local del componente. Si crece, lo refactorizamos.
- **Estilo**: Tailwind utility classes, sin librería de UI. Diseño Stitch llega después de tener app funcional.
- **i18n**: español hardcoded, consistente con todo M1+M2.

### Fuera de alcance (deferido)

- Restaurar workers archivados (botón "Desarchivar"). Si surge, ticket de operativa.
- Bulk actions (aprobar varios a la vez).
- Optimistic UI (refetch tras mutación es suficiente en 1b).
- Paginación / virtualización (innecesaria a estas escalas).
- Stitch design (M3 o post-MVP).
- Ruta `/admin/agenda/:worker_id` (reemplazada por modal).
- `/candidato/gracias` (fusionada con `/candidato/verificar`).

## 2. Mapa de rutas

### Públicas (no requieren auth)

| Ruta | Componente | Propósito |
|---|---|---|
| `/candidato/registro` | `CandidatoRegistro` | Form de inscripción. Requiere query `?company=<slug>`. |
| `/candidato/registro-enviado` | `CandidatoRegistroEnviado` | "Te hemos enviado un email a X". Recibe email en `location.state`. |
| `/candidato/verificar` | `CandidatoVerificar` | Dispara verify al montar. Muestra loading → success/error. Requiere query `?token=<jwt>`. |

### Admin (protegidas)

| Ruta | Componente | Cambio |
|---|---|---|
| `/admin/agenda` | `AdminAgenda` (refactor del placeholder actual) | Pestañas + tabla + modal de ficha. |

## 3. Flujos

### 3.1 Registro de candidato (público)

```
/candidato/registro?company=eventos-perez-l2m4k7
   │
   ▼ on mount: GET /functions/v1/company-by-slug?slug=...
   │
   ├── 404 → mostrar "Empresa no encontrada" + parada
   └── 200 { name } → render header "Inscribirme en <name>" + form
       │
       ▼ submit:
       │   POST /functions/v1/request-worker-registration
       │   body: { company_slug, first_name, last_name, email, phone,
       │           postal_code?, languages, experience_summary?, website (honeypot) }
       │
       ├── 400 validation → render errores debajo de los campos
       ├── 404 company_not_found → "Empresa no encontrada" (raro, slug puede haber sido borrado entre lookup y submit)
       ├── 500 email_send_failed → "Hubo un problema enviando el email. Inténtalo de nuevo."
       └── 200 → navigate('/candidato/registro-enviado', { state: { email } })

/candidato/registro-enviado
   • Mensaje fijo: "Te hemos enviado un email a <email>. Haz click en el enlace
     para confirmar tu inscripción. Si no lo encuentras revisa SPAM."
   • Si no hay state.email (acceso directo), mensaje genérico sin email.

(Candidato abre email → click → /candidato/verificar?token=<jwt>)

/candidato/verificar?token=<jwt>
   │
   ▼ on mount: POST /functions/v1/verify-worker-registration { token }
   │
   ├── 400 invalid_token → "Este enlace no es válido."
   ├── 400 token_expired → "Este enlace ha caducado. Vuelve a empezar el registro."
   ├── 404 company_not_found → "Empresa no encontrada."
   ├── 500 registration_failed → "Hubo un problema. Inténtalo más tarde."
   └── 200 { company_name } → "¡Gracias por inscribirte en <company_name>!
       Estudiaremos tu candidatura y nos pondremos en contacto pronto."
```

### 3.2 Gestión de agenda (admin)

```
/admin/agenda
   │
   ▼ on mount: cargar TODOS los workers del tenant (RLS filtra por company_id)
   │   useState<Worker[]> + un solo SELECT
   │
   ├── tabs: [Aprobados (default)] [Pendientes (N)]
   ├── toggle: [☐ Mostrar archivados]
   ├── search: <input> filtra por nombre/apellido/email client-side
   │
   ▼ por fila:
   │
   ├── Pendientes:
   │   • [Aprobar] → click directo (sin confirm) → POST /functions/v1/approve-worker
   │   • [Rechazar] → window.confirm → UPDATE workers SET status='rejected', archived_at=now()
   │   • [Archivar] → window.confirm → UPDATE workers SET archived_at=now()
   │   • [Ver ficha] → abre modal
   │
   ├── Aprobados:
   │   • [Archivar] → window.confirm → UPDATE workers SET archived_at=now()
   │   • [Ver ficha] → abre modal
   │
   └── (Archivados, vía toggle):
       • Sin acciones (solo lectura)
       • [Ver ficha] → abre modal

Tras cada mutación → refetch() del listado completo.
```

### 3.3 Modal de ficha

Render de todos los campos del worker:
- Nombre completo, email, teléfono
- Código postal (si existe)
- Idiomas (como chips)
- Experiencia (texto multi-línea preservando saltos)
- Estado actual (badge: amarillo pending, verde approved, rojo rejected, gris archived)
- Fechas: `created_at`, `approved_at` (si existe), `archived_at` (si existe)

Mismas acciones del row según estado. Cerrar con botón X o click fuera.

## 4. Estructura de archivos

```
src/
├── routes/
│   ├── candidato/                          ← NEW
│   │   ├── registro.tsx                    ← form público
│   │   ├── registro-enviado.tsx            ← pantalla intermedia
│   │   └── verificar.tsx                   ← dispara verify y muestra resultado
│   └── admin/
│       └── agenda.tsx                      ← refactor (era placeholder)
├── features/                                ← NEW (organización por feature)
│   └── workers/
│       ├── api.ts                          ← wrappers de fetch + supabase
│       ├── types.ts                        ← Worker, WorkerStatus, LanguageOption
│       ├── AgendaTabs.tsx                  ← pestañas + toggle + search
│       ├── AgendaTable.tsx                 ← tabla de workers de un tab
│       ├── WorkerDetailModal.tsx           ← modal de ficha
│       └── RegistroForm.tsx                ← form RHF + Zod
├── components/                              ← NEW (utilidades cross-feature)
│   └── Modal.tsx                           ← shell del modal genérico
└── App.tsx                                  ← añadir rutas /candidato/*
```

**Por qué `features/workers/` y no todo en `routes/`**: las rutas son shells delgados (~30 LOC); la lógica vive en `features/`. Cuando llegue 1b-clientes y 1b-eventos seguirán el mismo patrón. Mantiene los archivos focalizados y reutilizables.

**Por qué `components/Modal.tsx` en raíz y no en features**: cualquier feature lo reusará (clientes, eventos también tendrán modales en M2 Fase 2/3).

## 5. Detalles de implementación

### 5.1 Tipo `Worker`

```ts
// src/features/workers/types.ts
export type WorkerStatus = 'pending' | 'approved' | 'rejected' | 'archived';

export type LanguageOption =
  | 'español' | 'catalán' | 'inglés' | 'francés' | 'alemán' | 'italiano'
  | 'portugués' | 'gallego' | 'euskera' | 'árabe' | 'chino' | 'ruso' | 'otros';

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  'español', 'catalán', 'inglés', 'francés', 'alemán', 'italiano',
  'portugués', 'gallego', 'euskera', 'árabe', 'chino', 'ruso', 'otros',
];

export type Worker = {
  id: string;
  company_id: string;
  email: string;
  phone: string;
  first_name: string;
  last_name: string;
  postal_code: string | null;
  languages: LanguageOption[];
  experience_summary: string | null;
  status: WorkerStatus;
  approved_at: string | null;
  approved_by: string | null;
  archived_at: string | null;
  created_at: string;
};
```

Tipo local en vez de regenerar `database.ts` ahora — el regen masivo se hace al final de M2 (spec global lo prevé). Local + explícito > regen anticipado.

### 5.2 API layer (`src/features/workers/api.ts`)

```ts
// Wrappers tipados sobre las Edge Functions y supabase-js.
// Cada una devuelve un Result discriminado (ok|error) para evitar throw.

export type LookupCompanyResult =
  | { ok: true; name: string }
  | { ok: false; error: 'not_found' | 'network' | 'unknown'; message?: string };

export async function lookupCompanyBySlug(slug: string): Promise<LookupCompanyResult>;

export type RequestRegistrationInput = {
  company_slug: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  postal_code?: string;
  languages: LanguageOption[];
  experience_summary?: string;
  website?: string; // honeypot — backend lo trata como bot si llega con contenido
};
export type RequestRegistrationResult =
  | { ok: true }
  | { ok: false; error: 'validation' | 'company_not_found' | 'email_send_failed' | 'network' | 'unknown'; message?: string };

export async function requestWorkerRegistration(input: RequestRegistrationInput): Promise<RequestRegistrationResult>;

export type VerifyRegistrationResult =
  | { ok: true; company_name: string }
  | { ok: false; error: 'invalid_token' | 'token_expired' | 'company_not_found' | 'registration_failed' | 'validation' | 'network' | 'unknown'; message?: string };

export async function verifyWorkerRegistration(token: string): Promise<VerifyRegistrationResult>;

// Admin (autenticado).
export async function listWorkers(): Promise<Worker[]>;        // RLS filtra por tenant
export async function approveWorker(workerId: string): Promise<{ ok: true; email_warning?: boolean } | { ok: false; error: string; message?: string }>;
// rejectWorker hace UPDATE { status: 'rejected', archived_at: now() } — atómico.
export async function rejectWorker(workerId: string): Promise<void>;
// archiveWorker hace UPDATE { archived_at: now() } — preserva status.
export async function archiveWorker(workerId: string): Promise<void>;
```

Patrón Result clonado de `src/lib/api/signup-admin.ts` para coherencia.

### 5.3 Honeypot en el form

```tsx
<input
  type="text"
  tabIndex={-1}
  autoComplete="off"
  aria-hidden="true"
  className="absolute left-[-9999px] w-px h-px overflow-hidden"
  {...register('website')}
/>
```

Posicionamiento absoluto fuera de viewport (no `display:none` — algunos bots ignoran display none pero rellenan campos visibles para el DOM). `tabIndex=-1` evita que un usuario lo enfoque con teclado. `aria-hidden` para lectores de pantalla.

### 5.4 RHF + Zod

Schema espejo del backend (`request-worker-registration`):

```ts
const schema = z.object({
  first_name: z.string().min(1, 'Obligatorio'),
  last_name: z.string().min(1, 'Obligatorio'),
  email: z.string().min(1, 'Obligatorio').email('Email inválido'),
  phone: z.string().regex(/^\+?[0-9]{9,15}$/, 'Teléfono inválido (9-15 dígitos)'),
  postal_code: z.string().regex(/^\d{5}$/, 'Código postal inválido (5 dígitos)').optional().or(z.literal('')),
  languages: z.array(z.enum([...])).min(1, 'Selecciona al menos un idioma').max(8, 'Máximo 8 idiomas'),
  experience_summary: z.string().max(500, 'Máximo 500 caracteres').optional().or(z.literal('')),
  website: z.string().optional(), // honeypot — sin reglas porque backend lo gestiona
});
```

`postal_code` y `experience_summary` aceptan `''` además de optional porque RHF deja strings vacíos por defecto y queremos no enviarlos si están vacíos (los limpiamos antes del POST).

### 5.5 useEffect anti double-invoke en `/candidato/verificar`

React StrictMode dispara los effects dos veces en dev. Si llamamos al endpoint sin guard, hacemos el verify dos veces. Aunque el backend es idempotente, evitamos ruido:

```tsx
useEffect(() => {
  let cancelled = false;
  (async () => {
    const result = await verifyWorkerRegistration(token);
    if (cancelled) return;
    setState(result.ok ? { kind: 'success', companyName: result.company_name } : { kind: 'error', error: result.error });
  })();
  return () => { cancelled = true; };
}, [token]);
```

### 5.6 Modal genérico

```tsx
// src/components/Modal.tsx
type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
};
export function Modal({ open, onClose, title, children }: ModalProps) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg max-w-2xl w-full mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-4">
          <h2 id="modal-title" className="text-xl font-bold">{title}</h2>
          <button onClick={onClose} aria-label="Cerrar" className="text-2xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
```

Sin focus trap ni ESC handler en 1b — añadir si surge necesidad real de accesibilidad antes de producción.

### 5.7 Routing (cambios en `App.tsx`)

```tsx
export const routes: RouteObject[] = [
  { path: '/', element: <Navigate to="/login" replace /> },
  { path: '/signup', element: <Signup /> },
  { path: '/login', element: <Login /> },
  // NEW: público
  { path: '/candidato/registro', element: <CandidatoRegistro /> },
  { path: '/candidato/registro-enviado', element: <CandidatoRegistroEnviado /> },
  { path: '/candidato/verificar', element: <CandidatoVerificar /> },
  // existente:
  {
    path: '/admin',
    element: <ProtectedRoute><AdminLayout /></ProtectedRoute>,
    children: [/* ... agenda ahora con componente real ... */],
  },
];
```

### 5.8 Sesión admin para llamar Edge Functions autenticadas

`approve-worker` requiere JWT del admin. supabase-js no lo manda automáticamente al llamar `/functions/v1/...` con `fetch`. Solución:

```ts
const { data: { session } } = await supabase.auth.getSession();
const headers = {
  'content-type': 'application/json',
  apikey: env.VITE_SUPABASE_ANON_KEY,
  Authorization: `Bearer ${session?.access_token ?? ''}`,
};
```

Si no hay sesión (no debería pasar dentro de `ProtectedRoute`), la function devolverá 401 y el componente mostrará error.

## 6. Tests (Vitest + RTL)

### 6.1 Tests nuevos

| Archivo | Cubre |
|---|---|
| `src/routes/candidato/registro.test.tsx` | Lookup 404 → mensaje; lookup 200 → form; submit válido → navigate; submit con error → mensaje. |
| `src/routes/candidato/registro-enviado.test.tsx` | Mensaje con email; mensaje genérico sin state. |
| `src/routes/candidato/verificar.test.tsx` | Loading → success (con company_name); error invalid_token; error token_expired. |
| `src/features/workers/RegistroForm.test.tsx` | Validación de cada campo: required, phone regex, postal_code regex, languages min/max, experience_summary max length. Honeypot oculto. |
| `src/features/workers/AgendaTabs.test.tsx` | Render con workers vacío (empty state); render con workers en mix de estados; click en tab cambia visible; toggle archivados; búsqueda filtra. |
| `src/features/workers/WorkerDetailModal.test.tsx` | Render con todos los campos; render con campos opcionales NULL; botón cerrar; click fuera cierra. |
| `src/features/workers/api.test.ts` | Wrappers parsean correctamente las respuestas felices y los errores conocidos de cada Edge Function. Mocks de `fetch` y `supabase`. |

### 6.2 Tests existentes a actualizar

- `src/App.test.tsx`: añadir verificación de que las rutas `/candidato/*` resuelven sin redirect a login.

### 6.3 No haremos (en 1b)

- Tests E2E (Playwright) — no hay infra; queda en el E2E manual del checklist M2 §7.4.

## 7. Criterios de aceptación

- [ ] Visitando `/candidato/registro?company=<slug>` con slug válido se ve el form con el nombre de la empresa.
- [ ] Visitando `/candidato/registro?company=<slug>` con slug inválido se ve "Empresa no encontrada".
- [ ] El form valida campos en cliente con los mismos límites que el backend (teléfono, postal_code, longitudes, idiomas 1-8).
- [ ] Submit válido navega a `/candidato/registro-enviado` mostrando el email.
- [ ] Click en el enlace del email (`/candidato/verificar?token=<jwt>`) muestra "¡Gracias por inscribirte en <X>!".
- [ ] Token caducado o inválido muestra mensaje claro.
- [ ] `/admin/agenda` muestra dos pestañas (Aprobados default, Pendientes con badge N) y toggle "Mostrar archivados".
- [ ] Click Aprobar en un Pendiente: la fila desaparece de Pendientes, aparece en Aprobados, el worker recibe email.
- [ ] Click Rechazar: confirm dialog; tras OK la fila desaparece de Pendientes y queda visible solo con toggle "Mostrar archivados" activo (con badge "Rechazado").
- [ ] Click Archivar: confirm dialog; tras OK la fila desaparece del tab activo y aparece solo con toggle "Mostrar archivados" activo (preservando su badge de estado original).
- [ ] Click "Ver ficha": modal muestra todos los campos. Cerrar con X o click fuera funciona.
- [ ] Búsqueda filtra el listado del tab activo por nombre/apellido/email (case-insensitive).
- [ ] Empty state visible en cada tab cuando no hay workers.
- [ ] Errores de red en las acciones admin muestran un banner de error sin romper la página.
- [ ] Todos los tests Vitest pasan.
- [ ] E2E manual descrito en §8 verificado contra `develop` y `main`.

## 8. E2E manual (pre-merge a main)

1. **Lookup OK**: abrir `/candidato/registro?company=<slug-existente>` → form con nombre correcto.
2. **Lookup KO**: abrir con slug inventado → "Empresa no encontrada".
3. **Form valid**: rellenar, submit → llega email → click → "¡Gracias por inscribirte!".
4. **Form invalid**: dejar idiomas vacío, postal_code mal, etc. → errores inline.
5. **Honeypot**: con DevTools rellenar `website` → submit → backend devuelve 200 silencioso → SPA navega a `/candidato/registro-enviado` (sin email enviado realmente; verificar en Resend dashboard que no salió).
6. **Token expirado**: forzar un token con TTL pasado en el JWT (modificar manualmente) → mensaje claro.
7. **Token inválido**: cambiar un char del JWT → mensaje claro.
8. **Admin**: signup admin → entrar a `/admin/agenda` → ver el candidato recién creado en Pendientes con badge 1.
9. **Aprobar**: click Aprobar → fila se mueve a Aprobados → email de bienvenida llega al candidato.
10. **Rechazar**: registrar otro candidato → rechazar → fila desaparece de Pendientes; activar toggle "Mostrar archivados" → debe aparecer con badge "Rechazado". Verificar en Table Editor que `status='rejected'` y `archived_at IS NOT NULL`.
11. **Archivar**: aprobar uno y luego archivarlo → desaparece de Aprobados → reaparece con toggle.
12. **Cross-tenant**: crear admin de otra empresa, login, abrir `/admin/agenda` → no debe ver workers del primer tenant.
13. **Modal**: abrir ficha → ver todos los campos → cerrar.
14. **Búsqueda**: registrar 3 candidatos → buscar por trozo del nombre → solo coincidencias.

## 9. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| RR v7 + StrictMode dispara el verify dos veces | Guard `cancelled` en useEffect cleanup; el backend es idempotente igualmente. |
| supabase-js no añade `Authorization` automáticamente al fetch a Edge Functions | Helper que obtiene `session.access_token` y lo añade. Falta de sesión → 401 manejado. |
| El usuario refresca `/candidato/registro-enviado` y pierde `state.email` | Mensaje genérico sin email. Aceptable: la info clave está en su bandeja. |
| `archived_at` se setea pero `status` no se actualiza a 'archived' | Decidido NO actualizar status en 1b. El archivado se mide por `archived_at IS NOT NULL`, no por `status='archived'`. Si M3 requiere status='archived' explícito, migrar entonces. |
| Worker rechazado se vuelve invisible | Resuelto en spec: rechazar incluye `archived_at=now()` en la misma UPDATE, así queda visible con toggle "Mostrar archivados" sin necesidad de una segunda acción manual del admin. |
| Honeypot positivo pero el SPA igualmente navega a "registro-enviado" sugiriendo éxito | Es intencional: si fuera bot, le hacemos creer que tuvo éxito (anti-detection). El bot no comprueba la bandeja. |
| Slug en query string es sensible a casing/encoding | Slugs son lowercase con guiones. RR pasa el valor tal cual; el backend hace match exacto en BD. Documentar en el form que el enlace se comparte tal cual lo dimos. |

## 10. No-objetivos explícitos

- No tocar `clientes.tsx`, `eventos.tsx`, `reportes.tsx`, `auditoria.tsx` (placeholders). Son alcance de Fases 2, 3 y M5.
- No introducir React Query, Zustand, ni librerías de UI.
- No introducir formateo de fechas con `date-fns` o similar — los mostramos con `toLocaleString('es-ES')` directamente.
- No introducir focus trap ni atajos de teclado en el modal (accesibilidad mínima viable: `role="dialog" aria-modal="true"`).
