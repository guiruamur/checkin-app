# Milestone 1 — Fundación: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Levantar el esqueleto del proyecto — Vite + React + Supabase + RLS multi-tenant + auth de admin funcionando end-to-end. Al terminar, un admin puede registrarse (creando su empresa), loguearse y navegar por las pantallas vacías del panel; RLS está verificado y bloquea acceso cruzado entre empresas.

**Architecture:** SPA Vite/React/TS desplegada en Cloudflare Pages, backend Supabase (Postgres + Auth + RLS), multi-tenant via columna `company_id` y políticas RLS basadas en claim `company_id` del JWT. Trigger SQL crea la fila `admin_users` al registrarse un usuario en Supabase Auth.

**Tech Stack:** Vite, React 18, TypeScript, Tailwind CSS, React Router v6, React Hook Form + Zod, Supabase (CLI local + cloud), Vitest + React Testing Library, pgTAP.

**Spec de referencia:** `docs/superpowers/specs/2026-05-16-checkin-app-design.md`

---

## File Structure (M1)

Al terminar M1 el repo tendrá esta estructura:

```
checkin-app/
├── src/
│   ├── main.tsx                         # entry point
│   ├── App.tsx                          # router root
│   ├── routes/
│   │   ├── signup.tsx                   # /signup
│   │   ├── login.tsx                    # /login
│   │   └── admin/
│   │       ├── layout.tsx               # shell con nav
│   │       ├── home.tsx                 # /admin
│   │       ├── agenda.tsx               # /admin/agenda
│   │       ├── clientes.tsx             # /admin/clientes
│   │       ├── eventos.tsx              # /admin/eventos
│   │       ├── reportes.tsx             # /admin/reportes
│   │       └── auditoria.tsx            # /admin/auditoria
│   ├── lib/
│   │   ├── supabase.ts                  # cliente Supabase singleton
│   │   └── env.ts                       # validación de env vars con Zod
│   ├── auth/
│   │   ├── AuthProvider.tsx             # context
│   │   ├── useAuth.ts                   # hook
│   │   └── ProtectedRoute.tsx           # guard
│   └── types/
│       └── database.ts                  # generado por supabase gen types
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   ├── 20260516000001_companies.sql
│   │   ├── 20260516000002_admin_users.sql
│   │   ├── 20260516000003_audit_log.sql
│   │   └── 20260516000004_rls_helpers.sql
│   └── tests/
│       ├── rls_tenant_isolation.sql     # pgTAP
│       └── signup_trigger.sql           # pgTAP
├── public/
├── docs/
├── .env.example
├── .env.local                           # gitignored
├── .gitignore
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── vitest.config.ts
├── tailwind.config.ts
├── postcss.config.js
├── index.html
└── README.md
```

---

## Phase 1 — Setup del proyecto y herramientas

### Task 1: Inicializar Vite + React + TypeScript + git

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `.gitignore`, `README.md`

- [ ] **Step 1: Crear el proyecto Vite**

Desde la raíz del proyecto:

```bash
npm create vite@latest . -- --template react-ts
```

Cuando pregunte por "current directory is not empty", responder `Ignore files and continue`.

- [ ] **Step 2: Instalar dependencias**

```bash
npm install
```

- [ ] **Step 3: Reemplazar `src/App.tsx` con un placeholder mínimo**

```tsx
export default function App() {
  return <div className="p-8 text-2xl">Checkin App</div>;
}
```

- [ ] **Step 4: Verificar que el dev server arranca**

```bash
npm run dev
```

Esperado: servidor en `http://localhost:5173`, pantalla con "Checkin App". Detener con Ctrl+C.

- [ ] **Step 5: Inicializar git con .gitignore correcto**

Asegurar que `.gitignore` incluye:

```
node_modules
dist
.env
.env.local
.env.*.local
*.log
.DS_Store
.vscode
.idea
supabase/.branches
supabase/.temp
```

```bash
git init
git add .
git commit -m "chore: initialize vite + react + ts project"
```

---

### Task 2: Añadir Tailwind CSS

**Files:**
- Create: `tailwind.config.ts`, `postcss.config.js`
- Modify: `src/index.css`, `src/App.tsx`

- [ ] **Step 1: Instalar Tailwind y dependencias**

```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

Esto genera `tailwind.config.js` y `postcss.config.js`. Renombrar `tailwind.config.js` a `tailwind.config.ts`.

- [ ] **Step 2: Configurar `tailwind.config.ts`**

```ts
import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 3: Reemplazar `src/index.css` con directivas Tailwind**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 4: Verificar que Tailwind funciona**

`src/App.tsx` ya usa `className="p-8 text-2xl"`. Arrancar `npm run dev` y comprobar que el texto está estilado (padding y tamaño grande).

- [ ] **Step 5: Commit**

```bash
git add tailwind.config.ts postcss.config.js src/index.css package.json package-lock.json
git commit -m "chore: add tailwind css"
```

---

### Task 3: Configurar Vitest y React Testing Library

**Files:**
- Create: `vitest.config.ts`, `src/test/setup.ts`, `src/App.test.tsx`

- [ ] **Step 1: Instalar dependencias de test**

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom @vitest/ui
```

- [ ] **Step 2: Crear `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
  },
});
```

- [ ] **Step 3: Crear `src/test/setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: Añadir tipo global de Vitest a `tsconfig.json`**

En `tsconfig.json`, dentro de `compilerOptions`, asegurar:

```json
"types": ["vitest/globals", "@testing-library/jest-dom"]
```

- [ ] **Step 5: Escribir el primer test (failing)**

Crear `src/App.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import App from "./App";

describe("App", () => {
  it("renders the app title", () => {
    render(<App />);
    expect(screen.getByText("Checkin App")).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Añadir script `test` a `package.json`**

En `scripts`:

```json
"test": "vitest",
"test:run": "vitest run"
```

- [ ] **Step 7: Ejecutar tests**

```bash
npm run test:run
```

Esperado: PASS — el test verifica el comportamiento actual de `App.tsx`.

- [ ] **Step 8: Commit**

```bash
git add vitest.config.ts src/test/setup.ts src/App.test.tsx tsconfig.json package.json package-lock.json
git commit -m "chore: configure vitest and react testing library"
```

---

### Task 4: Configurar React Router con rutas vacías

**Files:**
- Create: `src/routes/signup.tsx`, `src/routes/login.tsx`, `src/routes/admin/layout.tsx`, `src/routes/admin/home.tsx`, `src/routes/admin/agenda.tsx`, `src/routes/admin/clientes.tsx`, `src/routes/admin/eventos.tsx`, `src/routes/admin/reportes.tsx`, `src/routes/admin/auditoria.tsx`
- Modify: `src/App.tsx`, `src/main.tsx`

- [ ] **Step 1: Instalar React Router**

```bash
npm install react-router-dom
```

- [ ] **Step 2: Crear placeholders mínimos para cada ruta**

Cada uno con el mismo patrón. Ejemplo `src/routes/signup.tsx`:

```tsx
export default function Signup() {
  return <div className="p-8">Signup</div>;
}
```

Repetir idénticamente cambiando el nombre del componente y el texto para: `login.tsx` (Login), `admin/home.tsx` (AdminHome), `admin/agenda.tsx` (AdminAgenda), `admin/clientes.tsx` (AdminClientes), `admin/eventos.tsx` (AdminEventos), `admin/reportes.tsx` (AdminReportes), `admin/auditoria.tsx` (AdminAuditoria).

Para `src/routes/admin/layout.tsx`:

```tsx
import { Outlet } from "react-router-dom";

export default function AdminLayout() {
  return (
    <div className="min-h-screen p-8">
      <header className="text-xl font-bold mb-4">Admin</header>
      <Outlet />
    </div>
  );
}
```

- [ ] **Step 3: Configurar el router en `src/App.tsx`**

```tsx
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import Signup from "./routes/signup";
import Login from "./routes/login";
import AdminLayout from "./routes/admin/layout";
import AdminHome from "./routes/admin/home";
import AdminAgenda from "./routes/admin/agenda";
import AdminClientes from "./routes/admin/clientes";
import AdminEventos from "./routes/admin/eventos";
import AdminReportes from "./routes/admin/reportes";
import AdminAuditoria from "./routes/admin/auditoria";

const router = createBrowserRouter([
  { path: "/signup", element: <Signup /> },
  { path: "/login", element: <Login /> },
  {
    path: "/admin",
    element: <AdminLayout />,
    children: [
      { index: true, element: <AdminHome /> },
      { path: "agenda", element: <AdminAgenda /> },
      { path: "clientes", element: <AdminClientes /> },
      { path: "eventos", element: <AdminEventos /> },
      { path: "reportes", element: <AdminReportes /> },
      { path: "auditoria", element: <AdminAuditoria /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
```

- [ ] **Step 4: Actualizar el test de `App.test.tsx`**

Como `App` ya no renderiza "Checkin App", el test falla. Reemplazar por:

```tsx
import { render, screen } from "@testing-library/react";
import App from "./App";

describe("App", () => {
  it("renders the login route by default redirection target", () => {
    window.history.pushState({}, "", "/login");
    render(<App />);
    expect(screen.getByText("Login")).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Ejecutar tests**

```bash
npm run test:run
```

Esperado: PASS.

- [ ] **Step 6: Verificar manualmente las rutas**

```bash
npm run dev
```

Visitar `http://localhost:5173/login`, `/signup`, `/admin`, `/admin/agenda`. Todas deben renderizar su placeholder.

- [ ] **Step 7: Commit**

```bash
git add src/ package.json package-lock.json
git commit -m "feat: add router with empty placeholder routes"
```

---

## Phase 2 — Supabase local y schema

### Task 5: Instalar Supabase CLI e inicializar proyecto local

**Files:**
- Create: `supabase/config.toml`, `.env.example`, `.env.local`

- [ ] **Step 1: Instalar Supabase CLI**

En Windows con Scoop (recomendado por Supabase):

```bash
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

Alternativa universal con npm (más lento pero funciona):

```bash
npm install -D supabase
```

(Si se usa la alternativa, prefijar todos los comandos `supabase` con `npx`.)

- [ ] **Step 2: Verificar instalación**

```bash
supabase --version
```

Esperado: versión >= 1.150.

- [ ] **Step 3: Inicializar el proyecto Supabase local**

```bash
supabase init
```

Esto crea la carpeta `supabase/` con `config.toml`.

- [ ] **Step 4: Arrancar Supabase local (requiere Docker Desktop corriendo)**

```bash
supabase start
```

Esperado: salida con URLs (`API URL`, `DB URL`, `Studio URL`) y `anon key`, `service_role key`. Anotar `API URL` y `anon key`.

- [ ] **Step 5: Crear `.env.example` y `.env.local`**

`.env.example`:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

`.env.local` (con los valores reales del `supabase start`):

```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<anon-key-de-supabase-start>
```

- [ ] **Step 6: Commit**

```bash
git add supabase/config.toml .env.example .gitignore package.json package-lock.json
git commit -m "chore: initialize supabase local project"
```

(Nota: `.env.local` no se commitea por el `.gitignore`.)

---

### Task 6: Migración — tabla `companies` con RLS

**Files:**
- Create: `supabase/migrations/20260516000001_companies.sql`

- [ ] **Step 1: Crear la migración**

```bash
supabase migration new companies
```

Esto crea un archivo timestamped en `supabase/migrations/`. Renombrar (o usar el nombre generado) y poblar:

```sql
-- companies: tenant root
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

alter table public.companies enable row level security;

-- nadie lee companies directamente desde el cliente (admins solo necesitan su propia info via JWT claim).
-- política mínima: nadie puede SELECT/INSERT/UPDATE/DELETE desde el cliente.
-- las operaciones sobre companies se hacen desde el flujo de signup (Edge Function o RPC con security definer).

-- index de búsqueda por slug (para el formulario público /candidato/registro)
create index companies_slug_idx on public.companies (slug);
```

- [ ] **Step 2: Aplicar la migración**

```bash
supabase db reset
```

Esperado: recrea la DB local con todas las migraciones aplicadas, sin errores.

- [ ] **Step 3: Verificar en Studio**

Abrir `http://127.0.0.1:54323`, navegar a Tables, comprobar que `companies` existe con RLS activado.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/
git commit -m "feat(db): add companies table with rls"
```

---

### Task 7: Migración — tabla `admin_users` + trigger de signup

**Files:**
- Create: `supabase/migrations/20260516000002_admin_users.sql`

- [ ] **Step 1: Crear la migración**

```bash
supabase migration new admin_users
```

Poblar el archivo:

```sql
-- admin_users: una fila por cada user de auth.users que es admin de una empresa
create table public.admin_users (
  id uuid primary key references auth.users (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  email text not null,
  full_name text not null,
  created_at timestamptz not null default now()
);

create index admin_users_company_idx on public.admin_users (company_id);

alter table public.admin_users enable row level security;

create policy admin_users_self_read on public.admin_users
  for select to authenticated
  using (id = auth.uid());

-- helper function: extraer company_id del usuario actual
create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from public.admin_users where id = auth.uid();
$$;

grant execute on function public.current_company_id() to authenticated;

-- RPC para el signup: crea company + admin_user atómicamente
-- el usuario ya existe en auth.users (creado por supabase.auth.signUp)
-- esta RPC añade su company y admin_user
create or replace function public.signup_create_company(
  p_company_name text,
  p_company_slug text,
  p_full_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_company_id uuid;
begin
  if v_user_id is null then
    raise exception 'must be authenticated';
  end if;

  if exists (select 1 from public.admin_users where id = v_user_id) then
    raise exception 'user already has an admin profile';
  end if;

  select email into v_email from auth.users where id = v_user_id;

  insert into public.companies (name, slug)
  values (p_company_name, p_company_slug)
  returning id into v_company_id;

  insert into public.admin_users (id, company_id, email, full_name)
  values (v_user_id, v_company_id, v_email, p_full_name);

  return v_company_id;
end;
$$;

grant execute on function public.signup_create_company(text, text, text) to authenticated;
```

- [ ] **Step 2: Aplicar la migración**

```bash
supabase db reset
```

Esperado: sin errores.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/
git commit -m "feat(db): add admin_users table, current_company_id helper, signup rpc"
```

---

### Task 8: Migración — tabla `audit_log` con RLS multi-tenant

**Files:**
- Create: `supabase/migrations/20260516000003_audit_log.sql`

- [ ] **Step 1: Crear la migración**

```bash
supabase migration new audit_log
```

Poblar:

```sql
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  actor_id uuid not null references public.admin_users (id) on delete restrict,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  diff jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_company_created_idx on public.audit_log (company_id, created_at desc);

alter table public.audit_log enable row level security;

create policy audit_log_tenant_read on public.audit_log
  for select to authenticated
  using (company_id = public.current_company_id());

-- audit_log se rellena via INSERT directo desde código (no permitido al cliente)
-- o via triggers en otras tablas (M2+). No damos INSERT a authenticated.
```

- [ ] **Step 2: Aplicar y verificar**

```bash
supabase db reset
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/
git commit -m "feat(db): add audit_log table with tenant rls"
```

---

### Task 9: Test pgTAP — aislamiento RLS entre empresas

**Files:**
- Create: `supabase/tests/rls_tenant_isolation.sql`

- [ ] **Step 1: Habilitar pgTAP en una migración**

```bash
supabase migration new enable_pgtap
```

Contenido:

```sql
create extension if not exists pgtap with schema extensions;
```

- [ ] **Step 2: Aplicar la migración**

```bash
supabase db reset
```

- [ ] **Step 3: Escribir el test (failing initially si algo está mal)**

`supabase/tests/rls_tenant_isolation.sql`:

```sql
begin;
select plan(3);

-- Setup: crear dos companies y dos admin_users en auth.users
insert into auth.users (id, email, encrypted_password, email_confirmed_at)
values
  ('11111111-1111-1111-1111-111111111111', 'admin1@a.com', '', now()),
  ('22222222-2222-2222-2222-222222222222', 'admin2@b.com', '', now());

insert into public.companies (id, name, slug) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Empresa A', 'empresa-a'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Empresa B', 'empresa-b');

insert into public.admin_users (id, company_id, email, full_name) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin1@a.com', 'Admin A'),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'admin2@b.com', 'Admin B');

insert into public.audit_log (company_id, actor_id, action, entity_type) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'test.A', 'test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'test.B', 'test');

-- Simular sesión como Admin A
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- Test 1: Admin A ve solo SU audit_log
select results_eq(
  $$ select count(*)::int from public.audit_log $$,
  $$ values (1) $$,
  'admin A only sees own company audit_log rows'
);

-- Test 2: Admin A ve solo su admin_user
select results_eq(
  $$ select count(*)::int from public.admin_users $$,
  $$ values (1) $$,
  'admin A only sees own admin_users row'
);

-- Test 3: current_company_id() devuelve la empresa correcta
select is(
  public.current_company_id(),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'current_company_id returns admin A company'
);

select * from finish();
rollback;
```

- [ ] **Step 4: Ejecutar el test**

```bash
supabase test db
```

Esperado: 3/3 tests PASS. Si falla, revisar políticas RLS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/ supabase/tests/
git commit -m "test(db): verify rls cross-tenant isolation"
```

---

## Phase 3 — Integración Supabase en el frontend

### Task 10: Cliente Supabase + validación de env vars

**Files:**
- Create: `src/lib/env.ts`, `src/lib/supabase.ts`

- [ ] **Step 1: Instalar dependencias**

```bash
npm install @supabase/supabase-js zod
```

- [ ] **Step 2: Crear validador de env vars**

`src/lib/env.ts`:

```ts
import { z } from "zod";

const envSchema = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(20),
});

export const env = envSchema.parse({
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
});
```

- [ ] **Step 3: Crear cliente Supabase singleton**

`src/lib/supabase.ts`:

```ts
import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

export const supabase = createClient(
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);
```

- [ ] **Step 4: Verificar que la app arranca sin errores**

```bash
npm run dev
```

Esperado: arranca sin errores en consola.

- [ ] **Step 5: Generar tipos de la DB**

```bash
supabase gen types typescript --local > src/types/database.ts
```

Verificar que `src/types/database.ts` contiene los tipos de `companies`, `admin_users`, `audit_log`.

- [ ] **Step 6: Tipar el cliente Supabase**

Actualizar `src/lib/supabase.ts`:

```ts
import { createClient } from "@supabase/supabase-js";
import { env } from "./env";
import type { Database } from "../types/database";

export const supabase = createClient<Database>(
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/ src/types/ package.json package-lock.json
git commit -m "feat: add typed supabase client and env validation"
```

---

### Task 11: AuthProvider y hook `useAuth`

**Files:**
- Create: `src/auth/AuthProvider.tsx`, `src/auth/useAuth.ts`, `src/auth/AuthProvider.test.tsx`
- Modify: `src/main.tsx`

- [ ] **Step 1: Escribir el test (failing)**

`src/auth/AuthProvider.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { AuthProvider } from "./AuthProvider";
import { useAuth } from "./useAuth";

function Probe() {
  const { user, loading } = useAuth();
  if (loading) return <div>loading</div>;
  if (!user) return <div>anonymous</div>;
  return <div>user: {user.email}</div>;
}

describe("AuthProvider", () => {
  it("starts in loading state then resolves to anonymous when no session", async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    expect(screen.getByText("loading")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("anonymous")).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test (verify it fails)**

```bash
npm run test:run -- AuthProvider
```

Esperado: FAIL (imports inexistentes).

- [ ] **Step 3: Implementar el provider**

`src/auth/AuthProvider.tsx`:

```tsx
import { createContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

type AuthState = {
  user: User | null;
  loading: boolean;
};

export const AuthContext = createContext<AuthState>({ user: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={{ user, loading }}>{children}</AuthContext.Provider>;
}
```

`src/auth/useAuth.ts`:

```ts
import { useContext } from "react";
import { AuthContext } from "./AuthProvider";

export function useAuth() {
  return useContext(AuthContext);
}
```

- [ ] **Step 4: Run test (verify it passes)**

```bash
npm run test:run -- AuthProvider
```

Esperado: PASS.

- [ ] **Step 5: Envolver la app en `AuthProvider`**

`src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./auth/AuthProvider";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>
);
```

- [ ] **Step 6: Commit**

```bash
git add src/auth/ src/main.tsx
git commit -m "feat(auth): add AuthProvider and useAuth hook"
```

---

### Task 12: `ProtectedRoute` para `/admin/*`

**Files:**
- Create: `src/auth/ProtectedRoute.tsx`, `src/auth/ProtectedRoute.test.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Escribir el test (failing)**

`src/auth/ProtectedRoute.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./AuthProvider";
import { ProtectedRoute } from "./ProtectedRoute";

describe("ProtectedRoute", () => {
  it("redirects to /login when user is not authenticated", async () => {
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={["/admin"]}>
          <Routes>
            <Route path="/login" element={<div>login page</div>} />
            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <div>admin page</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText("login page")).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test (verify it fails)**

```bash
npm run test:run -- ProtectedRoute
```

Esperado: FAIL.

- [ ] **Step 3: Implementar `ProtectedRoute`**

`src/auth/ProtectedRoute.tsx`:

```tsx
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./useAuth";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8">Cargando…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
```

- [ ] **Step 4: Run test (verify it passes)**

```bash
npm run test:run -- ProtectedRoute
```

Esperado: PASS.

- [ ] **Step 5: Aplicar el guard en el router**

`src/App.tsx`, envolver el bloque `/admin`:

```tsx
{
  path: "/admin",
  element: (
    <ProtectedRoute>
      <AdminLayout />
    </ProtectedRoute>
  ),
  children: [
    // ... (igual que antes)
  ],
},
```

Y añadir el import al principio:

```tsx
import { ProtectedRoute } from "./auth/ProtectedRoute";
```

- [ ] **Step 6: Verificar manualmente**

```bash
npm run dev
```

Visitar `http://localhost:5173/admin` sin sesión → debe redirigir a `/login`.

- [ ] **Step 7: Commit**

```bash
git add src/auth/ src/App.tsx
git commit -m "feat(auth): protect /admin routes, redirect to /login if anonymous"
```

---

## Phase 4 — Flujos de signup, login y logout

### Task 13: Página de signup (crea empresa + admin_user)

**Files:**
- Modify: `src/routes/signup.tsx`
- Create: `src/routes/signup.test.tsx`

- [ ] **Step 1: Instalar dependencias de formulario**

```bash
npm install react-hook-form @hookform/resolvers
```

(`zod` ya está instalado.)

- [ ] **Step 2: Escribir el test (failing)**

`src/routes/signup.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Signup from "./signup";

describe("Signup page", () => {
  it("renders all required fields and validates them", async () => {
    render(<MemoryRouter><Signup /></MemoryRouter>);
    expect(screen.getByLabelText(/nombre de tu empresa/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/tu nombre/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /crear cuenta/i }));
    // Validación falla → debe mostrar al menos un mensaje de error
    expect(await screen.findByText(/obligatorio/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test (verify it fails)**

```bash
npm run test:run -- signup
```

Esperado: FAIL.

- [ ] **Step 4: Implementar la página**

`src/routes/signup.tsx`:

```tsx
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

const schema = z.object({
  companyName: z.string().min(1, "Obligatorio"),
  fullName: z.string().min(1, "Obligatorio"),
  email: z.string().email("Email inválido"),
  password: z.string().min(8, "Mínimo 8 caracteres"),
});

type FormData = z.infer<typeof schema>;

function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function Signup() {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormData) {
    setServerError(null);
    const { data: signupData, error: signupError } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
    });
    if (signupError || !signupData.user) {
      setServerError(signupError?.message ?? "Error desconocido");
      return;
    }
    const { error: rpcError } = await supabase.rpc("signup_create_company", {
      p_company_name: data.companyName,
      p_company_slug: slugify(data.companyName) + "-" + Date.now().toString(36),
      p_full_name: data.fullName,
    });
    if (rpcError) {
      setServerError(rpcError.message);
      return;
    }
    navigate("/admin");
  }

  return (
    <div className="max-w-md mx-auto p-8">
      <h1 className="text-2xl font-bold mb-6">Crear cuenta de admin</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="companyName" className="block mb-1">Nombre de tu empresa</label>
          <input id="companyName" {...register("companyName")} className="border w-full p-2 rounded" />
          {errors.companyName && <p className="text-red-600 text-sm">{errors.companyName.message}</p>}
        </div>
        <div>
          <label htmlFor="fullName" className="block mb-1">Tu nombre</label>
          <input id="fullName" {...register("fullName")} className="border w-full p-2 rounded" />
          {errors.fullName && <p className="text-red-600 text-sm">{errors.fullName.message}</p>}
        </div>
        <div>
          <label htmlFor="email" className="block mb-1">Email</label>
          <input id="email" type="email" {...register("email")} className="border w-full p-2 rounded" />
          {errors.email && <p className="text-red-600 text-sm">{errors.email.message}</p>}
        </div>
        <div>
          <label htmlFor="password" className="block mb-1">Contraseña</label>
          <input id="password" type="password" {...register("password")} className="border w-full p-2 rounded" />
          {errors.password && <p className="text-red-600 text-sm">{errors.password.message}</p>}
        </div>
        {serverError && <p className="text-red-600 text-sm">{serverError}</p>}
        <button
          type="submit"
          disabled={isSubmitting}
          className="bg-black text-white px-4 py-2 rounded disabled:opacity-50"
        >
          Crear cuenta
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 5: Run test (verify it passes)**

```bash
npm run test:run -- signup
```

Esperado: PASS.

- [ ] **Step 6: Probar manualmente el flujo end-to-end**

```bash
npm run dev
```

Visitar `/signup`, rellenar el formulario. Verificar en Supabase Studio (`http://127.0.0.1:54323`) que:
- `auth.users` tiene una nueva fila
- `public.companies` tiene una nueva fila
- `public.admin_users` tiene una fila enlazada

- [ ] **Step 7: Commit**

```bash
git add src/routes/signup.tsx src/routes/signup.test.tsx package.json package-lock.json
git commit -m "feat(auth): admin signup creates company and admin_user atomically"
```

---

### Task 14: Página de login

**Files:**
- Modify: `src/routes/login.tsx`
- Create: `src/routes/login.test.tsx`

- [ ] **Step 1: Escribir el test (failing)**

`src/routes/login.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Login from "./login";

describe("Login page", () => {
  it("renders email and password fields", () => {
    render(<MemoryRouter><Login /></MemoryRouter>);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument();
  });

  it("shows validation errors on empty submit", async () => {
    render(<MemoryRouter><Login /></MemoryRouter>);
    await userEvent.click(screen.getByRole("button", { name: /entrar/i }));
    expect(await screen.findByText(/obligatorio/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test (verify it fails)**

```bash
npm run test:run -- login
```

Esperado: FAIL.

- [ ] **Step 3: Implementar `src/routes/login.tsx`**

```tsx
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

const schema = z.object({
  email: z.string().min(1, "Obligatorio").email("Email inválido"),
  password: z.string().min(1, "Obligatorio"),
});

type FormData = z.infer<typeof schema>;

export default function Login() {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormData) {
    setServerError(null);
    const { error } = await supabase.auth.signInWithPassword(data);
    if (error) {
      setServerError("Email o contraseña incorrectos");
      return;
    }
    navigate("/admin");
  }

  return (
    <div className="max-w-md mx-auto p-8">
      <h1 className="text-2xl font-bold mb-6">Entrar</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="email" className="block mb-1">Email</label>
          <input id="email" type="email" {...register("email")} className="border w-full p-2 rounded" />
          {errors.email && <p className="text-red-600 text-sm">{errors.email.message}</p>}
        </div>
        <div>
          <label htmlFor="password" className="block mb-1">Contraseña</label>
          <input id="password" type="password" {...register("password")} className="border w-full p-2 rounded" />
          {errors.password && <p className="text-red-600 text-sm">{errors.password.message}</p>}
        </div>
        {serverError && <p className="text-red-600 text-sm">{serverError}</p>}
        <button
          type="submit"
          disabled={isSubmitting}
          className="bg-black text-white px-4 py-2 rounded disabled:opacity-50"
        >
          Entrar
        </button>
      </form>
      <p className="text-sm mt-4">
        ¿No tienes cuenta? <Link to="/signup" className="underline">Crear una</Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Run test (verify it passes)**

```bash
npm run test:run -- login
```

Esperado: PASS.

- [ ] **Step 5: Probar manualmente**

```bash
npm run dev
```

Con la cuenta creada en Task 13, ir a `/login`, introducir credenciales, comprobar redirección a `/admin`.

- [ ] **Step 6: Commit**

```bash
git add src/routes/login.tsx src/routes/login.test.tsx
git commit -m "feat(auth): admin login page"
```

---

### Task 15: Botón de logout en el layout admin

**Files:**
- Modify: `src/routes/admin/layout.tsx`

- [ ] **Step 1: Actualizar el layout con nav y logout**

`src/routes/admin/layout.tsx`:

```tsx
import { Outlet, Link, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../auth/useAuth";

export default function AdminLayout() {
  const navigate = useNavigate();
  const { user } = useAuth();

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate("/login");
  }

  return (
    <div className="min-h-screen">
      <header className="border-b px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="font-bold">Checkin Admin</span>
          <nav className="flex gap-4 text-sm">
            <Link to="/admin">Inicio</Link>
            <Link to="/admin/agenda">Agenda</Link>
            <Link to="/admin/clientes">Clientes</Link>
            <Link to="/admin/eventos">Eventos</Link>
            <Link to="/admin/reportes">Reportes</Link>
            <Link to="/admin/auditoria">Auditoría</Link>
          </nav>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span>{user?.email}</span>
          <button onClick={handleLogout} className="underline">Salir</button>
        </div>
      </header>
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Verificar manualmente**

```bash
npm run dev
```

Logueado, ir a `/admin`, comprobar nav y email visibles. Click en "Salir" → redirige a `/login`. Intentar volver a `/admin` → te redirige a `/login` (ProtectedRoute).

- [ ] **Step 3: Commit**

```bash
git add src/routes/admin/layout.tsx
git commit -m "feat(admin): layout with nav and logout"
```

---

## Phase 5 — Despliegue a Cloudflare Pages + Supabase cloud

### Task 16: Crear proyecto Supabase en cloud y aplicar migraciones

**Files:** ninguno (operación externa)

- [ ] **Step 1: Crear el proyecto en Supabase**

En `https://supabase.com/dashboard`:
- "New project"
- Nombre: `checkin-app-prod`
- Región: la más cercana a tus usuarios (ej. `eu-west-1`)
- Contraseña de DB: generar segura, guardar en gestor de contraseñas
- Plan: Free

Anotar la URL del proyecto y el `anon key` (Settings → API).

- [ ] **Step 2: Linkear el proyecto local al cloud**

```bash
supabase login
supabase link --project-ref <project-ref>
```

(`<project-ref>` es el subdominio antes de `.supabase.co`.)

- [ ] **Step 3: Aplicar migraciones al cloud**

```bash
supabase db push
```

Esperado: aplica las 4 migraciones (companies, admin_users, audit_log, enable_pgtap) sin errores.

- [ ] **Step 4: Verificar en Studio cloud**

Abrir `https://supabase.com/dashboard/project/<project-ref>/database/tables` y comprobar que las 3 tablas (`companies`, `admin_users`, `audit_log`) existen con RLS activado.

- [ ] **Step 5: (Sin commit, operación externa)**

---

### Task 17: Crear proyecto en Cloudflare Pages y desplegar

**Files:**
- Modify: `package.json` (script `build`)

- [ ] **Step 1: Verificar que `npm run build` funciona en local**

```bash
npm run build
```

Esperado: build exitoso, output en `dist/`. Si falla por tipos, corregir.

- [ ] **Step 2: Subir el repo a GitHub**

Crear repo en GitHub (privado), añadir remote y push:

```bash
git remote add origin https://github.com/<tu-usuario>/checkin-app.git
git branch -M main
git push -u origin main
```

- [ ] **Step 3: Crear proyecto en Cloudflare Pages**

En `https://dash.cloudflare.com/?to=/:account/pages`:
- "Create a project" → "Connect to Git"
- Autorizar el repo `checkin-app`
- Build settings:
  - Framework preset: **Vite**
  - Build command: `npm run build`
  - Build output directory: `dist`
- Environment variables (Production):
  - `VITE_SUPABASE_URL` = URL de tu proyecto cloud
  - `VITE_SUPABASE_ANON_KEY` = anon key de tu proyecto cloud
- "Save and Deploy"

- [ ] **Step 4: Verificar el deploy**

Esperar el build (~1-2 min). Abrir la URL `*.pages.dev` proporcionada. Visitar `/signup`, crear una cuenta, verificar en Supabase Studio cloud que se crearon las filas.

- [ ] **Step 5: Añadir el remote real al README**

`README.md`:

```markdown
# Checkin App

App web de registro horario para empresas de azafatos para eventos.

## Stack

- Frontend: Vite + React + TS + Tailwind, hosted en Cloudflare Pages
- Backend: Supabase (Postgres + Auth + Edge Functions)

## Desarrollo local

1. Instalar Docker Desktop y Supabase CLI
2. `npm install`
3. `supabase start` (anotar URL y anon key)
4. Copiar `.env.example` a `.env.local` con los valores locales
5. `npm run dev`

## Tests

- Frontend: `npm run test`
- DB (RLS, triggers): `supabase test db`

## Deploy

Push a `main` → Cloudflare Pages despliega automáticamente.
```

- [ ] **Step 6: Commit y push**

```bash
git add README.md
git commit -m "docs: add README with stack and dev instructions"
git push
```

---

## Phase 6 — Verificación final

### Task 18: Smoke test end-to-end del milestone

**Files:** ninguno (verificación manual)

- [ ] **Step 1: Verificar en local**

```bash
supabase start
npm run dev
```

Pasos:
1. Visitar `/signup` → crear cuenta con email/password nuevos
2. Verificar redirección a `/admin`
3. Verificar nav visible, email del usuario en cabecera
4. Click en cada item del nav → cada ruta renderiza su placeholder
5. Click en "Salir" → redirige a `/login`
6. Intentar acceder a `/admin` directamente → redirige a `/login`
7. Login con las credenciales creadas → vuelve a `/admin`

- [ ] **Step 2: Verificar en producción (Cloudflare Pages)**

Repetir los 7 pasos en la URL de producción.

- [ ] **Step 3: Ejecutar todos los tests**

```bash
npm run test:run
supabase test db
```

Esperado: todos los tests PASS.

- [ ] **Step 4: Tag de la versión**

```bash
git tag -a v0.1.0-m1 -m "Milestone 1 — Fundación completa"
git push --tags
```

---

## Criterios de "M1 hecho"

- [x] SPA Vite + React + TS + Tailwind + React Router funcionando
- [x] Supabase local arrancando con `supabase start`
- [x] 4 migraciones aplicadas (companies, admin_users, audit_log, enable_pgtap)
- [x] RPC `signup_create_company` crea company + admin_user atómicamente
- [x] RLS verificado con pgTAP (3 tests pasando)
- [x] Auth funcionando: signup, login, logout, protección de rutas
- [x] AuthProvider con `useAuth` hook
- [x] 6 rutas admin con placeholders y layout con nav
- [x] App desplegada en Cloudflare Pages
- [x] Proyecto Supabase cloud creado y migraciones aplicadas
- [x] README mínimo con instrucciones de dev
