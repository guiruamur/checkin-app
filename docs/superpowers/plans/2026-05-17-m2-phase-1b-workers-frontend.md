# M2 Fase 1b — Workers frontend: Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar todo el frontend del ciclo de workers (registro público de candidato + panel admin de agenda con aprobación/rechazo/archivado), cerrando el flujo end-to-end con el backend de Fase 1a.

**Architecture:** Rutas públicas para el candidato (`/candidato/registro`, `/registro-enviado`, `/verificar`) que llaman a las Edge Functions de Fase 1a. Refactor de `/admin/agenda` con dos pestañas (Aprobados/Pendientes), toggle de archivados, búsqueda client-side y modal de ficha. Capa de API tipada en `src/features/workers/api.ts`, tipo `Worker` local en `types.ts` (sin regenerar `database.ts` hasta cerrar M2).

**Tech Stack:** React 19 + Vite + TypeScript + React Router v7 + React Hook Form + Zod + Tailwind v3 + supabase-js + Vitest + RTL. Sin React Query, sin librerías UI.

**Spec:** `docs/superpowers/specs/2026-05-17-m2-phase-1b-workers-frontend-design.md`

---

### Task 1: Tipos `Worker` + capa de API tipada

**Files:**
- Create: `src/features/workers/types.ts`
- Create: `src/features/workers/api.ts`
- Test: `src/features/workers/api.test.ts`

- [ ] **Step 1: Crear `src/features/workers/types.ts` con el tipo `Worker` y enum de idiomas**

```ts
export type WorkerStatus = 'pending' | 'approved' | 'rejected' | 'archived';

export const LANGUAGE_OPTIONS = [
  'español', 'catalán', 'inglés', 'francés', 'alemán', 'italiano',
  'portugués', 'gallego', 'euskera', 'árabe', 'chino', 'ruso', 'otros',
] as const;
export type LanguageOption = typeof LANGUAGE_OPTIONS[number];

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

- [ ] **Step 2: Crear `src/features/workers/api.ts` con wrappers para Edge Functions y supabase-js**

Patrón Result discriminado (igual que `src/lib/api/signup-admin.ts`).

```ts
import { supabase } from '../../lib/supabase';
import { env } from '../../lib/env';
import type { LanguageOption, Worker } from './types';

// --- lookupCompanyBySlug ---
export type LookupCompanyResult =
  | { ok: true; name: string }
  | { ok: false; error: 'not_found' | 'network' | 'unknown'; message?: string };

export async function lookupCompanyBySlug(slug: string): Promise<LookupCompanyResult> {
  let res: Response;
  try {
    res = await fetch(
      `${env.VITE_SUPABASE_URL}/functions/v1/company-by-slug?slug=${encodeURIComponent(slug)}`,
      { headers: { apikey: env.VITE_SUPABASE_ANON_KEY } },
    );
  } catch (e) {
    return { ok: false, error: 'network', message: String(e) };
  }
  if (res.status === 404) return { ok: false, error: 'not_found' };
  let json: unknown;
  try { json = await res.json(); } catch { return { ok: false, error: 'unknown', message: `HTTP ${res.status} non-JSON` }; }
  if (res.ok && (json as { name?: string }).name) return { ok: true, name: (json as { name: string }).name };
  return { ok: false, error: 'unknown', message: (json as { message?: string }).message };
}

// --- requestWorkerRegistration ---
export type RequestRegistrationInput = {
  company_slug: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  postal_code?: string;
  languages: LanguageOption[];
  experience_summary?: string;
  website?: string;
};
export type RequestRegistrationError =
  | 'validation' | 'company_not_found' | 'email_send_failed' | 'network' | 'unknown';
export type RequestRegistrationResult =
  | { ok: true }
  | { ok: false; error: RequestRegistrationError; message?: string };

export async function requestWorkerRegistration(input: RequestRegistrationInput): Promise<RequestRegistrationResult> {
  let res: Response;
  try {
    res = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/request-worker-registration`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: env.VITE_SUPABASE_ANON_KEY },
      body: JSON.stringify(input),
    });
  } catch (e) {
    return { ok: false, error: 'network', message: String(e) };
  }
  if (res.ok) return { ok: true };
  let json: { error?: string; message?: string } = {};
  try { json = await res.json(); } catch { /* puede no haber body */ }
  const known: RequestRegistrationError[] = ['validation', 'company_not_found', 'email_send_failed'];
  const error = (known as string[]).includes(json.error ?? '') ? (json.error as RequestRegistrationError) : 'unknown';
  return { ok: false, error, message: json.message };
}

// --- verifyWorkerRegistration ---
export type VerifyRegistrationError =
  | 'invalid_token' | 'token_expired' | 'company_not_found' | 'registration_failed' | 'validation' | 'network' | 'unknown';
export type VerifyRegistrationResult =
  | { ok: true; company_name: string }
  | { ok: false; error: VerifyRegistrationError; message?: string };

export async function verifyWorkerRegistration(token: string): Promise<VerifyRegistrationResult> {
  let res: Response;
  try {
    res = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/verify-worker-registration`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: env.VITE_SUPABASE_ANON_KEY },
      body: JSON.stringify({ token }),
    });
  } catch (e) {
    return { ok: false, error: 'network', message: String(e) };
  }
  let json: unknown;
  try { json = await res.json(); } catch { return { ok: false, error: 'unknown', message: `HTTP ${res.status} non-JSON` }; }
  if (res.ok && (json as { company_name?: string }).company_name) {
    return { ok: true, company_name: (json as { company_name: string }).company_name };
  }
  const body = json as { error?: string; message?: string };
  const known: VerifyRegistrationError[] = ['invalid_token', 'token_expired', 'company_not_found', 'registration_failed', 'validation'];
  const error = (known as string[]).includes(body.error ?? '') ? (body.error as VerifyRegistrationError) : 'unknown';
  return { ok: false, error, message: body.message };
}

// --- listWorkers (admin) ---
export async function listWorkers(): Promise<Worker[]> {
  // RLS filtra por company_id automaticamente via JWT claim.
  const { data, error } = await supabase
    .from('workers')
    // deno-lint-ignore no-explicit-any
    .select('*' as any)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Worker[];
}

// --- approveWorker (admin, Edge Function con email) ---
export type ApproveWorkerResult =
  | { ok: true; email_warning?: boolean }
  | { ok: false; error: string; message?: string };

export async function approveWorker(workerId: string): Promise<ApproveWorkerResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: 'no_session' };
  let res: Response;
  try {
    res = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/approve-worker`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ worker_id: workerId }),
    });
  } catch (e) {
    return { ok: false, error: 'network', message: String(e) };
  }
  let json: { ok?: boolean; email_warning?: boolean; error?: string; message?: string } = {};
  try { json = await res.json(); } catch { /* ignore */ }
  if (res.ok && json.ok) return { ok: true, email_warning: json.email_warning };
  return { ok: false, error: json.error ?? `http_${res.status}`, message: json.message };
}

// --- rejectWorker (admin, supabase-js directo, status='rejected' + archived_at=now()) ---
export async function rejectWorker(workerId: string): Promise<void> {
  const { error } = await supabase
    .from('workers')
    // deno-lint-ignore no-explicit-any
    .update({ status: 'rejected', archived_at: new Date().toISOString() } as any)
    .eq('id', workerId);
  if (error) throw new Error(error.message);
}

// --- archiveWorker (admin, supabase-js directo, preserva status) ---
export async function archiveWorker(workerId: string): Promise<void> {
  const { error } = await supabase
    .from('workers')
    // deno-lint-ignore no-explicit-any
    .update({ archived_at: new Date().toISOString() } as any)
    .eq('id', workerId);
  if (error) throw new Error(error.message);
}
```

Nota sobre los `as any`: `database.ts` aún no incluye `workers` (regen al final de M2). Localizo los casts en la capa de API y los acompaño de un comentario para que sea obvio que es deuda voluntaria.

- [ ] **Step 3: Escribir tests de la capa de API**

Crear `src/features/workers/api.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../lib/env', () => ({
  env: { VITE_SUPABASE_URL: 'http://stub', VITE_SUPABASE_ANON_KEY: 'anon' },
}));

const mockGetSession = vi.fn();
const mockUpdate = vi.fn();
const mockEq = vi.fn();
const mockFrom = vi.fn(() => ({ update: mockUpdate, select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }));
mockUpdate.mockReturnValue({ eq: mockEq });

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: { getSession: mockGetSession },
    from: mockFrom,
  },
}));

import {
  lookupCompanyBySlug,
  requestWorkerRegistration,
  verifyWorkerRegistration,
  approveWorker,
  rejectWorker,
  archiveWorker,
} from './api';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
  mockGetSession.mockReset();
  mockUpdate.mockReset();
  mockEq.mockReset();
  mockUpdate.mockReturnValue({ eq: mockEq });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('lookupCompanyBySlug', () => {
  it('returns ok with name on 200', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, status: 200, json: () => Promise.resolve({ name: 'Eventos Pérez' }),
    });
    const r = await lookupCompanyBySlug('eventos-perez');
    expect(r).toEqual({ ok: true, name: 'Eventos Pérez' });
  });
  it('returns not_found on 404', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false, status: 404, json: () => Promise.resolve({ error: 'not_found' }),
    });
    const r = await lookupCompanyBySlug('nope');
    expect(r).toEqual({ ok: false, error: 'not_found' });
  });
  it('returns network on fetch throw', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));
    const r = await lookupCompanyBySlug('x');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('network');
  });
});

describe('requestWorkerRegistration', () => {
  const input = {
    company_slug: 'x', first_name: 'A', last_name: 'B',
    email: 'a@b.com', phone: '600000000', languages: ['español' as const],
  };
  it('ok on 200', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, status: 200, json: () => Promise.resolve({}),
    });
    const r = await requestWorkerRegistration(input);
    expect(r).toEqual({ ok: true });
  });
  it('validation on 400 with known error', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false, status: 400, json: () => Promise.resolve({ error: 'validation' }),
    });
    const r = await requestWorkerRegistration(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('validation');
  });
  it('email_send_failed on 500 with known error', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false, status: 500, json: () => Promise.resolve({ error: 'email_send_failed' }),
    });
    const r = await requestWorkerRegistration(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('email_send_failed');
  });
});

describe('verifyWorkerRegistration', () => {
  it('ok with company_name on 200', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, status: 200, json: () => Promise.resolve({ company_name: 'X' }),
    });
    const r = await verifyWorkerRegistration('tok');
    expect(r).toEqual({ ok: true, company_name: 'X' });
  });
  it('invalid_token on 400', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false, status: 400, json: () => Promise.resolve({ error: 'invalid_token' }),
    });
    const r = await verifyWorkerRegistration('tok');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('invalid_token');
  });
  it('token_expired on 400', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false, status: 400, json: () => Promise.resolve({ error: 'token_expired' }),
    });
    const r = await verifyWorkerRegistration('tok');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('token_expired');
  });
});

describe('approveWorker', () => {
  it('no_session when not logged in', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    const r = await approveWorker('w1');
    expect(r).toEqual({ ok: false, error: 'no_session' });
  });
  it('ok on 200 from edge function', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 't' } } });
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, status: 200, json: () => Promise.resolve({ ok: true }),
    });
    const r = await approveWorker('w1');
    expect(r).toEqual({ ok: true, email_warning: undefined });
  });
  it('passes email_warning through', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 't' } } });
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, status: 200, json: () => Promise.resolve({ ok: true, email_warning: true }),
    });
    const r = await approveWorker('w1');
    expect(r).toEqual({ ok: true, email_warning: true });
  });
});

describe('rejectWorker', () => {
  it('calls supabase update with status=rejected and archived_at', async () => {
    mockEq.mockResolvedValue({ error: null });
    await rejectWorker('w1');
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      status: 'rejected',
      archived_at: expect.any(String),
    }));
    expect(mockEq).toHaveBeenCalledWith('id', 'w1');
  });
  it('throws on supabase error', async () => {
    mockEq.mockResolvedValue({ error: { message: 'rls' } });
    await expect(rejectWorker('w1')).rejects.toThrow('rls');
  });
});

describe('archiveWorker', () => {
  it('calls supabase update with archived_at only', async () => {
    mockEq.mockResolvedValue({ error: null });
    await archiveWorker('w1');
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ archived_at: expect.any(String) }));
    expect(mockUpdate).toHaveBeenCalledWith(expect.not.objectContaining({ status: expect.anything() }));
  });
});
```

- [ ] **Step 4: Ejecutar tests y verificar que pasan**

Run: `npm run test:run -- src/features/workers/api.test.ts`
Expected: todos los tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/workers/types.ts src/features/workers/api.ts src/features/workers/api.test.ts
git commit -m "feat(workers): types + api wrappers para edge functions

Tipo Worker local (regen de database.ts queda para final de M2),
6 wrappers tipados con Result discriminado para lookupCompanyBySlug,
requestWorkerRegistration, verifyWorkerRegistration, approveWorker
(con JWT del admin), rejectWorker (status=rejected + archived_at),
archiveWorker (preserva status)."
```

---

### Task 2: Componente genérico `Modal`

**Files:**
- Create: `src/components/Modal.tsx`
- Test: `src/components/Modal.test.tsx`

- [ ] **Step 1: Escribir el test primero**

```tsx
// src/components/Modal.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from './Modal';

describe('Modal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<Modal open={false} onClose={() => {}} title="t">child</Modal>);
    expect(container).toBeEmptyDOMElement();
  });
  it('renders title and children when open', () => {
    render(<Modal open onClose={() => {}} title="Mi título">contenido</Modal>);
    expect(screen.getByText('Mi título')).toBeInTheDocument();
    expect(screen.getByText('contenido')).toBeInTheDocument();
  });
  it('has dialog role and aria-modal', () => {
    render(<Modal open onClose={() => {}} title="t">x</Modal>);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });
  it('calls onClose when × button is clicked', async () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} title="t">x</Modal>);
    await userEvent.click(screen.getByLabelText(/cerrar/i));
    expect(onClose).toHaveBeenCalled();
  });
  it('calls onClose when backdrop is clicked', async () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} title="t">x</Modal>);
    await userEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalled();
  });
  it('does NOT call onClose when content area is clicked', async () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} title="t">contenido</Modal>);
    await userEvent.click(screen.getByText('contenido'));
    expect(onClose).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Correr test para verificar que falla**

Run: `npm run test:run -- src/components/Modal.test.tsx`
Expected: FAIL — `Modal` no existe.

- [ ] **Step 3: Implementar `src/components/Modal.tsx`**

```tsx
import type { ReactNode } from 'react';

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-4">
          <h2 id="modal-title" className="text-xl font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="text-2xl leading-none px-2 hover:text-gray-600"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Correr test y verificar que pasa**

Run: `npm run test:run -- src/components/Modal.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/Modal.tsx src/components/Modal.test.tsx
git commit -m "feat(components): genérico Modal con backdrop click + cerrar

Sin focus trap ni atajo ESC (suficiente para 1b; se añadirá si la
ficha del worker u otro flujo lo pide en pre-produccion)."
```

---

### Task 3: Componente `RegistroForm`

**Files:**
- Create: `src/features/workers/RegistroForm.tsx`
- Test: `src/features/workers/RegistroForm.test.tsx`

- [ ] **Step 1: Escribir el test primero**

```tsx
// src/features/workers/RegistroForm.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RegistroForm } from './RegistroForm';

describe('RegistroForm', () => {
  it('renders all required fields', () => {
    render(<RegistroForm onSubmit={vi.fn()} />);
    expect(screen.getByLabelText(/nombre/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/apellidos/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/teléfono/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/código postal/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/experiencia/i)).toBeInTheDocument();
    // Idiomas: hay 13 checkboxes
    const langCheckboxes = screen.getAllByRole('checkbox');
    expect(langCheckboxes.length).toBe(13);
  });

  it('shows validation errors when submitted empty', async () => {
    render(<RegistroForm onSubmit={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /enviar/i }));
    expect(await screen.findAllByText(/obligatorio/i)).not.toHaveLength(0);
  });

  it('shows phone format error', async () => {
    render(<RegistroForm onSubmit={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/teléfono/i), 'abc');
    await userEvent.click(screen.getByRole('button', { name: /enviar/i }));
    expect(await screen.findByText(/teléfono inválido/i)).toBeInTheDocument();
  });

  it('shows postal code format error', async () => {
    render(<RegistroForm onSubmit={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/código postal/i), '123');
    await userEvent.click(screen.getByRole('button', { name: /enviar/i }));
    expect(await screen.findByText(/código postal inválido/i)).toBeInTheDocument();
  });

  it('requires at least one language', async () => {
    render(<RegistroForm onSubmit={vi.fn()} />);
    // Rellenar el resto valido
    await userEvent.type(screen.getByLabelText(/nombre/i), 'Ana');
    await userEvent.type(screen.getByLabelText(/apellidos/i), 'López');
    await userEvent.type(screen.getByLabelText(/^email$/i), 'a@b.com');
    await userEvent.type(screen.getByLabelText(/teléfono/i), '600000000');
    await userEvent.click(screen.getByRole('button', { name: /enviar/i }));
    expect(await screen.findByText(/al menos un idioma/i)).toBeInTheDocument();
  });

  it('calls onSubmit with normalized payload on valid form', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<RegistroForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText(/nombre/i), 'Ana');
    await userEvent.type(screen.getByLabelText(/apellidos/i), 'López');
    await userEvent.type(screen.getByLabelText(/^email$/i), 'a@b.com');
    await userEvent.type(screen.getByLabelText(/teléfono/i), '600000000');
    await userEvent.click(screen.getByLabelText('español'));
    await userEvent.click(screen.getByRole('button', { name: /enviar/i }));
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const payload = onSubmit.mock.calls[0][0];
    expect(payload).toMatchObject({
      first_name: 'Ana',
      last_name: 'López',
      email: 'a@b.com',
      phone: '600000000',
      languages: ['español'],
    });
    // postal_code y experience_summary deben ser undefined cuando vacíos
    expect(payload.postal_code).toBeUndefined();
    expect(payload.experience_summary).toBeUndefined();
  });

  it('honeypot field is hidden but present in the DOM', () => {
    render(<RegistroForm onSubmit={vi.fn()} />);
    const honeypot = document.querySelector('input[name="website"]') as HTMLInputElement;
    expect(honeypot).toBeTruthy();
    expect(honeypot.tabIndex).toBe(-1);
    expect(honeypot.getAttribute('aria-hidden')).toBe('true');
  });

  it('submit button is disabled while submitting', async () => {
    let resolve: () => void = () => {};
    const onSubmit = vi.fn().mockReturnValue(new Promise<void>((r) => { resolve = r; }));
    render(<RegistroForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText(/nombre/i), 'Ana');
    await userEvent.type(screen.getByLabelText(/apellidos/i), 'López');
    await userEvent.type(screen.getByLabelText(/^email$/i), 'a@b.com');
    await userEvent.type(screen.getByLabelText(/teléfono/i), '600000000');
    await userEvent.click(screen.getByLabelText('español'));
    await userEvent.click(screen.getByRole('button', { name: /enviar/i }));
    await vi.waitFor(() => expect(screen.getByRole('button', { name: /enviando|enviar/i })).toBeDisabled());
    resolve();
  });
});
```

- [ ] **Step 2: Correr test para verificar que falla**

Run: `npm run test:run -- src/features/workers/RegistroForm.test.tsx`
Expected: FAIL — `RegistroForm` no existe.

- [ ] **Step 3: Implementar `src/features/workers/RegistroForm.tsx`**

```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { LANGUAGE_OPTIONS, type LanguageOption } from './types';

const schema = z.object({
  first_name: z.string().min(1, 'Obligatorio'),
  last_name: z.string().min(1, 'Obligatorio'),
  email: z.string().min(1, 'Obligatorio').email('Email inválido'),
  phone: z.string().regex(/^\+?[0-9]{9,15}$/, 'Teléfono inválido (9-15 dígitos)'),
  postal_code: z
    .string()
    .regex(/^\d{5}$/, 'Código postal inválido (5 dígitos)')
    .or(z.literal(''))
    .optional(),
  languages: z
    .array(z.enum(LANGUAGE_OPTIONS))
    .min(1, 'Selecciona al menos un idioma')
    .max(8, 'Máximo 8 idiomas'),
  experience_summary: z
    .string()
    .max(500, 'Máximo 500 caracteres')
    .or(z.literal(''))
    .optional(),
  website: z.string().optional(),
});

export type RegistroFormValues = z.infer<typeof schema>;

export type RegistroFormPayload = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  postal_code?: string;
  languages: LanguageOption[];
  experience_summary?: string;
  website?: string;
};

type Props = {
  onSubmit: (payload: RegistroFormPayload) => Promise<void> | void;
};

export function RegistroForm({ onSubmit }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegistroFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { languages: [], website: '' },
  });

  async function handle(values: RegistroFormValues) {
    const payload: RegistroFormPayload = {
      first_name: values.first_name,
      last_name: values.last_name,
      email: values.email,
      phone: values.phone,
      languages: values.languages,
      ...(values.postal_code ? { postal_code: values.postal_code } : {}),
      ...(values.experience_summary ? { experience_summary: values.experience_summary } : {}),
      ...(values.website ? { website: values.website } : {}),
    };
    await onSubmit(payload);
  }

  return (
    <form onSubmit={handleSubmit(handle)} className="space-y-4">
      <div>
        <label htmlFor="first_name" className="block mb-1">Nombre</label>
        <input id="first_name" {...register('first_name')} className="border w-full p-2 rounded" />
        {errors.first_name && <p className="text-red-600 text-sm">{errors.first_name.message}</p>}
      </div>

      <div>
        <label htmlFor="last_name" className="block mb-1">Apellidos</label>
        <input id="last_name" {...register('last_name')} className="border w-full p-2 rounded" />
        {errors.last_name && <p className="text-red-600 text-sm">{errors.last_name.message}</p>}
      </div>

      <div>
        <label htmlFor="email" className="block mb-1">Email</label>
        <input id="email" type="email" {...register('email')} className="border w-full p-2 rounded" />
        {errors.email && <p className="text-red-600 text-sm">{errors.email.message}</p>}
      </div>

      <div>
        <label htmlFor="phone" className="block mb-1">Teléfono</label>
        <input id="phone" type="tel" {...register('phone')} className="border w-full p-2 rounded" />
        {errors.phone && <p className="text-red-600 text-sm">{errors.phone.message}</p>}
      </div>

      <div>
        <label htmlFor="postal_code" className="block mb-1">Código postal (opcional)</label>
        <input id="postal_code" {...register('postal_code')} className="border w-full p-2 rounded" />
        {errors.postal_code && <p className="text-red-600 text-sm">{errors.postal_code.message}</p>}
      </div>

      <fieldset>
        <legend className="mb-1">Idiomas</legend>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {LANGUAGE_OPTIONS.map((lang) => (
            <label key={lang} className="flex items-center gap-2">
              <input
                type="checkbox"
                value={lang}
                {...register('languages')}
                aria-label={lang}
              />
              <span>{lang}</span>
            </label>
          ))}
        </div>
        {errors.languages && <p className="text-red-600 text-sm">{errors.languages.message}</p>}
      </fieldset>

      <div>
        <label htmlFor="experience_summary" className="block mb-1">Experiencia (opcional)</label>
        <textarea
          id="experience_summary"
          {...register('experience_summary')}
          className="border w-full p-2 rounded"
          rows={4}
          maxLength={500}
        />
        {errors.experience_summary && <p className="text-red-600 text-sm">{errors.experience_summary.message}</p>}
      </div>

      {/* Honeypot: input visible para bots, invisible para humanos */}
      <input
        type="text"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute left-[-9999px] w-px h-px overflow-hidden"
        {...register('website')}
      />

      <button
        type="submit"
        disabled={isSubmitting}
        className="bg-black text-white px-4 py-2 rounded disabled:opacity-50"
      >
        {isSubmitting ? 'Enviando…' : 'Enviar inscripción'}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Correr test y verificar que pasa**

Run: `npm run test:run -- src/features/workers/RegistroForm.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/workers/RegistroForm.tsx src/features/workers/RegistroForm.test.tsx
git commit -m "feat(workers): formulario público de inscripción con RHF+Zod+honeypot"
```

---

### Task 4: Ruta `/candidato/registro` + wire en App.tsx

**Files:**
- Create: `src/routes/candidato/registro.tsx`
- Modify: `src/App.tsx`
- Test: `src/routes/candidato/registro.test.tsx`

- [ ] **Step 1: Escribir el test primero**

```tsx
// src/routes/candidato/registro.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../features/workers/api', () => ({
  lookupCompanyBySlug: vi.fn(),
  requestWorkerRegistration: vi.fn(),
}));

import { lookupCompanyBySlug, requestWorkerRegistration } from '../../features/workers/api';
import CandidatoRegistro from './registro';

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/candidato/registro" element={<CandidatoRegistro />} />
        <Route path="/candidato/registro-enviado" element={<div>ENVIADO</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(lookupCompanyBySlug).mockReset();
  vi.mocked(requestWorkerRegistration).mockReset();
});

describe('CandidatoRegistro', () => {
  it('shows missing-slug message when ?company is absent', async () => {
    renderAt('/candidato/registro');
    expect(await screen.findByText(/falta el parámetro/i)).toBeInTheDocument();
  });

  it('shows not-found message when company lookup is 404', async () => {
    vi.mocked(lookupCompanyBySlug).mockResolvedValue({ ok: false, error: 'not_found' });
    renderAt('/candidato/registro?company=ghost');
    expect(await screen.findByText(/empresa no encontrada/i)).toBeInTheDocument();
  });

  it('renders form with company name on lookup success', async () => {
    vi.mocked(lookupCompanyBySlug).mockResolvedValue({ ok: true, name: 'Eventos Pérez' });
    renderAt('/candidato/registro?company=eventos-perez');
    expect(await screen.findByText(/Eventos Pérez/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /enviar/i })).toBeInTheDocument();
  });

  it('navigates to /registro-enviado after successful submit', async () => {
    vi.mocked(lookupCompanyBySlug).mockResolvedValue({ ok: true, name: 'X' });
    vi.mocked(requestWorkerRegistration).mockResolvedValue({ ok: true });
    renderAt('/candidato/registro?company=x');
    await screen.findByRole('button', { name: /enviar/i });
    await userEvent.type(screen.getByLabelText(/nombre/i), 'Ana');
    await userEvent.type(screen.getByLabelText(/apellidos/i), 'L');
    await userEvent.type(screen.getByLabelText(/^email$/i), 'a@b.com');
    await userEvent.type(screen.getByLabelText(/teléfono/i), '600000000');
    await userEvent.click(screen.getByLabelText('español'));
    await userEvent.click(screen.getByRole('button', { name: /enviar/i }));
    expect(await screen.findByText('ENVIADO')).toBeInTheDocument();
  });

  it('shows error message when submit returns email_send_failed', async () => {
    vi.mocked(lookupCompanyBySlug).mockResolvedValue({ ok: true, name: 'X' });
    vi.mocked(requestWorkerRegistration).mockResolvedValue({ ok: false, error: 'email_send_failed' });
    renderAt('/candidato/registro?company=x');
    await screen.findByRole('button', { name: /enviar/i });
    await userEvent.type(screen.getByLabelText(/nombre/i), 'Ana');
    await userEvent.type(screen.getByLabelText(/apellidos/i), 'L');
    await userEvent.type(screen.getByLabelText(/^email$/i), 'a@b.com');
    await userEvent.type(screen.getByLabelText(/teléfono/i), '600000000');
    await userEvent.click(screen.getByLabelText('español'));
    await userEvent.click(screen.getByRole('button', { name: /enviar/i }));
    expect(await screen.findByText(/problema enviando el email/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr test y verificar que falla**

Run: `npm run test:run -- src/routes/candidato/registro.test.tsx`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Implementar `src/routes/candidato/registro.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { RegistroForm, type RegistroFormPayload } from '../../features/workers/RegistroForm';
import { lookupCompanyBySlug, requestWorkerRegistration } from '../../features/workers/api';

type LookupState =
  | { kind: 'loading' }
  | { kind: 'missing_slug' }
  | { kind: 'not_found' }
  | { kind: 'error'; message?: string }
  | { kind: 'ok'; name: string };

export default function CandidatoRegistro() {
  const [searchParams] = useSearchParams();
  const slug = searchParams.get('company');
  const navigate = useNavigate();
  const [lookup, setLookup] = useState<LookupState>({ kind: 'loading' });
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!slug) {
      setLookup({ kind: 'missing_slug' });
      return;
    }
    (async () => {
      const r = await lookupCompanyBySlug(slug);
      if (cancelled) return;
      if (r.ok) setLookup({ kind: 'ok', name: r.name });
      else if (r.error === 'not_found') setLookup({ kind: 'not_found' });
      else setLookup({ kind: 'error', message: r.message });
    })();
    return () => { cancelled = true; };
  }, [slug]);

  async function handleSubmit(payload: RegistroFormPayload) {
    if (lookup.kind !== 'ok' || !slug) return;
    setSubmitError(null);
    const r = await requestWorkerRegistration({ company_slug: slug, ...payload });
    if (!r.ok) {
      const msg =
        r.error === 'validation' ? 'Datos inválidos. Revisa el formulario.'
        : r.error === 'company_not_found' ? 'Empresa no encontrada.'
        : r.error === 'email_send_failed' ? 'Hubo un problema enviando el email. Inténtalo de nuevo.'
        : r.error === 'network' ? 'Sin conexión. Inténtalo más tarde.'
        : 'Ha ocurrido un error. Inténtalo más tarde.';
      setSubmitError(msg);
      return;
    }
    navigate('/candidato/registro-enviado', { state: { email: payload.email } });
  }

  return (
    <div className="max-w-xl mx-auto p-8">
      {lookup.kind === 'loading' && <p>Cargando…</p>}
      {lookup.kind === 'missing_slug' && (
        <p className="text-red-600">Falta el parámetro <code>company</code> en la URL.</p>
      )}
      {lookup.kind === 'not_found' && <p className="text-red-600">Empresa no encontrada.</p>}
      {lookup.kind === 'error' && (
        <p className="text-red-600">Error al cargar la empresa. Inténtalo más tarde.</p>
      )}
      {lookup.kind === 'ok' && (
        <>
          <h1 className="text-2xl font-bold mb-2">Inscribirme en {lookup.name}</h1>
          <p className="text-gray-600 mb-6">
            Rellena el formulario y te enviaremos un email para confirmar tu inscripción.
          </p>
          {submitError && <p className="text-red-600 mb-4">{submitError}</p>}
          <RegistroForm onSubmit={handleSubmit} />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Añadir ruta en `src/App.tsx`**

Editar `src/App.tsx`. Añadir import:

```tsx
import CandidatoRegistro from "./routes/candidato/registro";
```

Y añadir al array `routes` entre `/login` y `/admin`:

```tsx
{ path: "/candidato/registro", element: <CandidatoRegistro /> },
```

- [ ] **Step 5: Correr test y verificar que pasa**

Run: `npm run test:run -- src/routes/candidato/registro.test.tsx`
Expected: PASS.

- [ ] **Step 6: Correr todos los tests para verificar no regresiones**

Run: `npm run test:run`
Expected: todos PASS.

- [ ] **Step 7: Commit**

```bash
git add src/routes/candidato/registro.tsx src/routes/candidato/registro.test.tsx src/App.tsx
git commit -m "feat(candidato): página de registro con lookup de empresa por slug"
```

---

### Task 5: Ruta `/candidato/registro-enviado`

**Files:**
- Create: `src/routes/candidato/registro-enviado.tsx`
- Modify: `src/App.tsx`
- Test: `src/routes/candidato/registro-enviado.test.tsx`

- [ ] **Step 1: Escribir el test primero**

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import CandidatoRegistroEnviado from './registro-enviado';

describe('CandidatoRegistroEnviado', () => {
  it('shows the email from location state', () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/x', state: { email: 'ana@b.com' } }]}>
        <Routes>
          <Route path="/x" element={<CandidatoRegistroEnviado />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText(/ana@b\.com/)).toBeInTheDocument();
    expect(screen.getByText(/spam/i)).toBeInTheDocument();
  });

  it('shows generic message when state is missing', () => {
    render(
      <MemoryRouter initialEntries={['/x']}>
        <Routes>
          <Route path="/x" element={<CandidatoRegistroEnviado />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText(/email para confirmar/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr test y verificar que falla**

Run: `npm run test:run -- src/routes/candidato/registro-enviado.test.tsx`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Implementar `src/routes/candidato/registro-enviado.tsx`**

```tsx
import { useLocation } from 'react-router-dom';

export default function CandidatoRegistroEnviado() {
  const location = useLocation();
  const email = (location.state as { email?: string } | null)?.email;

  return (
    <div className="max-w-xl mx-auto p-8 text-center">
      <h1 className="text-2xl font-bold mb-4">Revisa tu correo</h1>
      {email ? (
        <p className="text-gray-700">
          Te hemos enviado un email a <strong>{email}</strong>. Haz click en el enlace
          para confirmar tu inscripción.
        </p>
      ) : (
        <p className="text-gray-700">
          Te hemos enviado un email para confirmar tu inscripción.
        </p>
      )}
      <p className="text-gray-500 mt-4 text-sm">
        Si no lo encuentras revisa la carpeta de SPAM.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Añadir ruta en `src/App.tsx`**

Añadir import:

```tsx
import CandidatoRegistroEnviado from "./routes/candidato/registro-enviado";
```

Y entrada en el array `routes`:

```tsx
{ path: "/candidato/registro-enviado", element: <CandidatoRegistroEnviado /> },
```

- [ ] **Step 5: Correr test y verificar que pasa**

Run: `npm run test:run -- src/routes/candidato/registro-enviado.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/routes/candidato/registro-enviado.tsx src/routes/candidato/registro-enviado.test.tsx src/App.tsx
git commit -m "feat(candidato): página intermedia 'revisa tu correo' tras submit"
```

---

### Task 6: Ruta `/candidato/verificar`

**Files:**
- Create: `src/routes/candidato/verificar.tsx`
- Modify: `src/App.tsx`
- Test: `src/routes/candidato/verificar.test.tsx`

- [ ] **Step 1: Escribir el test primero**

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../features/workers/api', () => ({
  verifyWorkerRegistration: vi.fn(),
}));

import { verifyWorkerRegistration } from '../../features/workers/api';
import CandidatoVerificar from './verificar';

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/candidato/verificar" element={<CandidatoVerificar />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => { vi.mocked(verifyWorkerRegistration).mockReset(); });

describe('CandidatoVerificar', () => {
  it('shows missing-token message when token is absent', async () => {
    renderAt('/candidato/verificar');
    expect(await screen.findByText(/enlace no válido/i)).toBeInTheDocument();
  });

  it('shows success message with company name', async () => {
    vi.mocked(verifyWorkerRegistration).mockResolvedValue({ ok: true, company_name: 'Eventos Pérez' });
    renderAt('/candidato/verificar?token=abc');
    expect(await screen.findByText(/gracias por inscribirte/i)).toBeInTheDocument();
    expect(screen.getByText(/Eventos Pérez/)).toBeInTheDocument();
  });

  it('shows expired-token message', async () => {
    vi.mocked(verifyWorkerRegistration).mockResolvedValue({ ok: false, error: 'token_expired' });
    renderAt('/candidato/verificar?token=expired');
    expect(await screen.findByText(/enlace ha caducado/i)).toBeInTheDocument();
  });

  it('shows invalid-token message', async () => {
    vi.mocked(verifyWorkerRegistration).mockResolvedValue({ ok: false, error: 'invalid_token' });
    renderAt('/candidato/verificar?token=bad');
    expect(await screen.findByText(/enlace no es válido/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr test y verificar que falla**

Run: `npm run test:run -- src/routes/candidato/verificar.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar `src/routes/candidato/verificar.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { verifyWorkerRegistration } from '../../features/workers/api';

type State =
  | { kind: 'loading' }
  | { kind: 'missing_token' }
  | { kind: 'success'; companyName: string }
  | { kind: 'error'; error: 'invalid_token' | 'token_expired' | 'company_not_found' | 'registration_failed' | 'validation' | 'network' | 'unknown' };

export default function CandidatoVerificar() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    if (!token) { setState({ kind: 'missing_token' }); return; }
    (async () => {
      const r = await verifyWorkerRegistration(token);
      if (cancelled) return;
      if (r.ok) setState({ kind: 'success', companyName: r.company_name });
      else setState({ kind: 'error', error: r.error });
    })();
    return () => { cancelled = true; };
  }, [token]);

  return (
    <div className="max-w-xl mx-auto p-8 text-center">
      {state.kind === 'loading' && <p>Verificando…</p>}
      {state.kind === 'missing_token' && (
        <p className="text-red-600">Este enlace no es válido.</p>
      )}
      {state.kind === 'success' && (
        <>
          <h1 className="text-2xl font-bold mb-4">¡Gracias por inscribirte en {state.companyName}!</h1>
          <p className="text-gray-700">
            Estudiaremos tu candidatura y nos pondremos en contacto pronto.
          </p>
        </>
      )}
      {state.kind === 'error' && (
        <p className="text-red-600">
          {state.error === 'token_expired' && 'Este enlace ha caducado. Vuelve a empezar el registro.'}
          {state.error === 'invalid_token' && 'Este enlace no es válido.'}
          {state.error === 'company_not_found' && 'Empresa no encontrada.'}
          {(state.error === 'registration_failed' || state.error === 'validation' || state.error === 'network' || state.error === 'unknown') &&
            'Hubo un problema. Inténtalo más tarde.'}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Añadir ruta en `src/App.tsx`**

Añadir import:

```tsx
import CandidatoVerificar from "./routes/candidato/verificar";
```

Y entrada:

```tsx
{ path: "/candidato/verificar", element: <CandidatoVerificar /> },
```

- [ ] **Step 5: Correr test y verificar que pasa**

Run: `npm run test:run -- src/routes/candidato/verificar.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/routes/candidato/verificar.tsx src/routes/candidato/verificar.test.tsx src/App.tsx
git commit -m "feat(candidato): página de verificación dispara verify al montar"
```

---

### Task 7: Componente `WorkerDetailModal`

**Files:**
- Create: `src/features/workers/WorkerDetailModal.tsx`
- Test: `src/features/workers/WorkerDetailModal.test.tsx`

- [ ] **Step 1: Escribir el test primero**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkerDetailModal } from './WorkerDetailModal';
import type { Worker } from './types';

const baseWorker: Worker = {
  id: 'w1',
  company_id: 'co',
  email: 'ana@x.com',
  phone: '600000000',
  first_name: 'Ana',
  last_name: 'López',
  postal_code: '08001',
  languages: ['español', 'inglés'],
  experience_summary: 'Tres años de experiencia.',
  status: 'pending',
  approved_at: null,
  approved_by: null,
  archived_at: null,
  created_at: '2026-05-17T10:00:00Z',
};

describe('WorkerDetailModal', () => {
  it('renders nothing when worker is null', () => {
    const { container } = render(<WorkerDetailModal worker={null} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders all fields of a complete worker', () => {
    render(<WorkerDetailModal worker={baseWorker} onClose={vi.fn()} />);
    expect(screen.getByText(/Ana López/)).toBeInTheDocument();
    expect(screen.getByText('ana@x.com')).toBeInTheDocument();
    expect(screen.getByText('600000000')).toBeInTheDocument();
    expect(screen.getByText('08001')).toBeInTheDocument();
    expect(screen.getByText('español')).toBeInTheDocument();
    expect(screen.getByText('inglés')).toBeInTheDocument();
    expect(screen.getByText(/tres años/i)).toBeInTheDocument();
    expect(screen.getByText(/pendiente/i)).toBeInTheDocument();
  });

  it('omits optional fields when null', () => {
    render(<WorkerDetailModal worker={{ ...baseWorker, postal_code: null, experience_summary: null }} onClose={vi.fn()} />);
    expect(screen.queryByText(/código postal/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/experiencia/i)).not.toBeInTheDocument();
  });

  it('shows approved badge with approved_at date', () => {
    render(
      <WorkerDetailModal
        worker={{ ...baseWorker, status: 'approved', approved_at: '2026-05-18T12:00:00Z' }}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/^Aprobado$/i)).toBeInTheDocument();
    expect(screen.getByText(/aprobado el:/i)).toBeInTheDocument();
  });

  it('shows archived marker when archived_at is set, preserving original status badge', () => {
    render(
      <WorkerDetailModal
        worker={{ ...baseWorker, status: 'approved', approved_at: '2026-05-18T12:00:00Z', archived_at: '2026-05-19T12:00:00Z' }}
        onClose={vi.fn()}
      />,
    );
    // El badge de estado original se preserva
    expect(screen.getByText(/^Aprobado$/i)).toBeInTheDocument();
    // Y aparece el marker de archivado (puede haber varios textos con "Archivad..."; basta con que exista al menos uno)
    expect(screen.getAllByText(/archivad/i).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Correr test y verificar que falla**

Run: `npm run test:run -- src/features/workers/WorkerDetailModal.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar `src/features/workers/WorkerDetailModal.tsx`**

```tsx
import { Modal } from '../../components/Modal';
import type { Worker, WorkerStatus } from './types';

type Props = {
  worker: Worker | null;
  onClose: () => void;
};

function StatusBadge({ status }: { status: WorkerStatus }) {
  const map: Record<WorkerStatus, { label: string; cls: string }> = {
    pending:  { label: 'Pendiente', cls: 'bg-yellow-100 text-yellow-800' },
    approved: { label: 'Aprobado',  cls: 'bg-green-100 text-green-800' },
    rejected: { label: 'Rechazado', cls: 'bg-red-100 text-red-800' },
    archived: { label: 'Archivado', cls: 'bg-gray-200 text-gray-800' },
  };
  const { label, cls } = map[status];
  return <span className={`inline-block px-2 py-1 text-xs rounded ${cls}`}>{label}</span>;
}

// Marker secundario que preserva el badge de estado original (spec §7).
function ArchivedMarker() {
  return <span className="inline-block px-2 py-1 text-xs rounded bg-gray-200 text-gray-700">Archivado</span>;
}

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString('es-ES');
}

export function WorkerDetailModal({ worker, onClose }: Props) {
  if (!worker) return null;
  const archived = worker.archived_at !== null;
  return (
    <Modal open onClose={onClose} title={`${worker.first_name} ${worker.last_name}`}>
      <div className="space-y-3 text-sm">
        <div className="flex gap-2 items-center flex-wrap">
          <StatusBadge status={worker.status} />
          {archived && <ArchivedMarker />}
          <span className="text-gray-500">Registrado: {fmtDate(worker.created_at)}</span>
        </div>
        <div>
          <span className="font-semibold">Email:</span> {worker.email}
        </div>
        <div>
          <span className="font-semibold">Teléfono:</span> {worker.phone}
        </div>
        {worker.postal_code && (
          <div>
            <span className="font-semibold">Código postal:</span> {worker.postal_code}
          </div>
        )}
        <div>
          <span className="font-semibold">Idiomas:</span>{' '}
          {worker.languages.map((l) => (
            <span key={l} className="inline-block px-2 py-0.5 mr-1 mb-1 text-xs rounded bg-blue-100 text-blue-800">{l}</span>
          ))}
        </div>
        {worker.experience_summary && (
          <div>
            <div className="font-semibold">Experiencia:</div>
            <p className="whitespace-pre-wrap text-gray-700">{worker.experience_summary}</p>
          </div>
        )}
        {worker.approved_at && (
          <div className="text-gray-500">Aprobado el: {fmtDate(worker.approved_at)}</div>
        )}
        {worker.archived_at && (
          <div className="text-gray-500">Archivado el: {fmtDate(worker.archived_at)}</div>
        )}
      </div>
    </Modal>
  );
}
```

- [ ] **Step 4: Correr test y verificar que pasa**

Run: `npm run test:run -- src/features/workers/WorkerDetailModal.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/workers/WorkerDetailModal.tsx src/features/workers/WorkerDetailModal.test.tsx
git commit -m "feat(workers): modal de ficha del worker con badges de estado"
```

---

### Task 8: Componente `AgendaTable`

**Files:**
- Create: `src/features/workers/AgendaTable.tsx`
- Test: `src/features/workers/AgendaTable.test.tsx`

Renderiza una tabla de workers con acciones contextuales según estado/archivado. Recibe callbacks; no llama a la API directamente (eso vive en `AgendaTabs`).

- [ ] **Step 1: Escribir el test primero**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AgendaTable } from './AgendaTable';
import type { Worker } from './types';

const base: Worker = {
  id: 'w1', company_id: 'co', email: 'a@x.com', phone: '600',
  first_name: 'Ana', last_name: 'López', postal_code: null,
  languages: ['español'], experience_summary: null,
  status: 'pending', approved_at: null, approved_by: null,
  archived_at: null, created_at: '2026-05-17T10:00:00Z',
};

const callbacks = {
  onApprove: vi.fn(), onReject: vi.fn(), onArchive: vi.fn(), onView: vi.fn(),
};

describe('AgendaTable', () => {
  it('shows empty state when workers is empty', () => {
    render(<AgendaTable workers={[]} {...callbacks} />);
    expect(screen.getByText(/sin candidatos/i)).toBeInTheDocument();
  });

  it('renders one row per worker with name and email', () => {
    render(<AgendaTable workers={[base, { ...base, id: 'w2', first_name: 'Beto' }]} {...callbacks} />);
    expect(screen.getByText(/Ana López/)).toBeInTheDocument();
    expect(screen.getByText(/Beto López/)).toBeInTheDocument();
  });

  it('shows Approve, Reject, Archive, View for pending non-archived', async () => {
    render(<AgendaTable workers={[base]} {...callbacks} />);
    expect(screen.getByRole('button', { name: /aprobar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /rechazar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /archivar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ver/i })).toBeInTheDocument();
  });

  it('shows only Archive and View for approved non-archived', () => {
    render(<AgendaTable workers={[{ ...base, status: 'approved' }]} {...callbacks} />);
    expect(screen.queryByRole('button', { name: /aprobar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /rechazar/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /archivar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ver/i })).toBeInTheDocument();
  });

  it('shows only View for archived workers', () => {
    render(<AgendaTable workers={[{ ...base, archived_at: '2026-05-18T10:00:00Z' }]} {...callbacks} />);
    expect(screen.queryByRole('button', { name: /aprobar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /rechazar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /archivar/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ver/i })).toBeInTheDocument();
  });

  it('calls onApprove with worker id', async () => {
    const fns = { ...callbacks, onApprove: vi.fn() };
    render(<AgendaTable workers={[base]} {...fns} />);
    await userEvent.click(screen.getByRole('button', { name: /aprobar/i }));
    expect(fns.onApprove).toHaveBeenCalledWith('w1');
  });

  it('calls onView with worker object', async () => {
    const fns = { ...callbacks, onView: vi.fn() };
    render(<AgendaTable workers={[base]} {...fns} />);
    await userEvent.click(screen.getByRole('button', { name: /ver/i }));
    expect(fns.onView).toHaveBeenCalledWith(base);
  });
});
```

- [ ] **Step 2: Correr test y verificar que falla**

Run: `npm run test:run -- src/features/workers/AgendaTable.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar `src/features/workers/AgendaTable.tsx`**

```tsx
import type { Worker } from './types';

type Props = {
  workers: Worker[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onArchive: (id: string) => void;
  onView: (worker: Worker) => void;
};

export function AgendaTable({ workers, onApprove, onReject, onArchive, onView }: Props) {
  if (workers.length === 0) {
    return <p className="text-gray-500 py-8 text-center">Sin candidatos en esta vista.</p>;
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left">
          <th className="py-2 pr-4">Nombre</th>
          <th className="py-2 pr-4">Email</th>
          <th className="py-2 pr-4">Teléfono</th>
          <th className="py-2 pr-4">Estado</th>
          <th className="py-2">Acciones</th>
        </tr>
      </thead>
      <tbody>
        {workers.map((w) => {
          const archived = w.archived_at !== null;
          return (
            <tr key={w.id} className="border-b">
              <td className="py-2 pr-4">{w.first_name} {w.last_name}</td>
              <td className="py-2 pr-4">{w.email}</td>
              <td className="py-2 pr-4">{w.phone}</td>
              <td className="py-2 pr-4">
                {w.status === 'pending' && 'Pendiente'}
                {w.status === 'approved' && 'Aprobado'}
                {w.status === 'rejected' && 'Rechazado'}
                {w.status === 'archived' && 'Archivado'}
                {archived && <span className="ml-1 text-xs text-gray-500">(archivado)</span>}
              </td>
              <td className="py-2 space-x-2">
                <button type="button" className="text-blue-600 underline" onClick={() => onView(w)}>Ver</button>
                {!archived && w.status === 'pending' && (
                  <>
                    <button type="button" className="text-green-700 underline" onClick={() => onApprove(w.id)}>Aprobar</button>
                    <button type="button" className="text-red-700 underline" onClick={() => onReject(w.id)}>Rechazar</button>
                  </>
                )}
                {!archived && (
                  <button type="button" className="text-gray-700 underline" onClick={() => onArchive(w.id)}>Archivar</button>
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

- [ ] **Step 4: Correr test y verificar que pasa**

Run: `npm run test:run -- src/features/workers/AgendaTable.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/workers/AgendaTable.tsx src/features/workers/AgendaTable.test.tsx
git commit -m "feat(workers): tabla de agenda con acciones por estado"
```

---

### Task 9: Componente `AgendaTabs` + refactor de `AdminAgenda`

**Files:**
- Create: `src/features/workers/AgendaTabs.tsx`
- Modify: `src/routes/admin/agenda.tsx`
- Test: `src/features/workers/AgendaTabs.test.tsx`

Orquesta: carga inicial, tabs (Aprobados / Pendientes con badge N), toggle "Mostrar archivados", búsqueda, mapping a `AgendaTable`, modal de ficha, mutaciones con refetch.

- [ ] **Step 1: Escribir el test primero**

```tsx
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('./api', () => ({
  listWorkers: vi.fn(),
  approveWorker: vi.fn(),
  rejectWorker: vi.fn(),
  archiveWorker: vi.fn(),
}));

import { listWorkers, approveWorker, rejectWorker, archiveWorker } from './api';
import { AgendaTabs } from './AgendaTabs';
import type { Worker } from './types';

function mkWorker(over: Partial<Worker> = {}): Worker {
  return {
    id: crypto.randomUUID(), company_id: 'co',
    email: `${over.first_name ?? 'x'}@x.com`, phone: '600000000',
    first_name: 'Ana', last_name: 'López',
    postal_code: null, languages: ['español'], experience_summary: null,
    status: 'pending', approved_at: null, approved_by: null, archived_at: null,
    created_at: '2026-05-17T10:00:00Z',
    ...over,
  };
}

beforeEach(() => {
  vi.mocked(listWorkers).mockReset();
  vi.mocked(approveWorker).mockReset();
  vi.mocked(rejectWorker).mockReset();
  vi.mocked(archiveWorker).mockReset();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('AgendaTabs', () => {
  it('shows loading initially then renders Aprobados tab by default', async () => {
    vi.mocked(listWorkers).mockResolvedValue([
      mkWorker({ first_name: 'Ana', status: 'approved' }),
      mkWorker({ first_name: 'Beto', status: 'pending' }),
    ]);
    render(<AgendaTabs />);
    expect(await screen.findByText(/Ana López/)).toBeInTheDocument();
    expect(screen.queryByText(/Beto López/)).not.toBeInTheDocument();
  });

  it('shows pending count badge in Pendientes tab', async () => {
    vi.mocked(listWorkers).mockResolvedValue([
      mkWorker({ first_name: 'A', status: 'pending' }),
      mkWorker({ first_name: 'B', status: 'pending' }),
      mkWorker({ first_name: 'C', status: 'approved' }),
    ]);
    render(<AgendaTabs />);
    await screen.findByText(/C López/);
    const pendingTab = screen.getByRole('button', { name: /pendientes/i });
    expect(within(pendingTab).getByText('2')).toBeInTheDocument();
  });

  it('switching to Pendientes tab shows pending workers', async () => {
    vi.mocked(listWorkers).mockResolvedValue([
      mkWorker({ first_name: 'A', status: 'pending' }),
      mkWorker({ first_name: 'B', status: 'approved' }),
    ]);
    render(<AgendaTabs />);
    await screen.findByText(/B López/);
    await userEvent.click(screen.getByRole('button', { name: /pendientes/i }));
    expect(await screen.findByText(/A López/)).toBeInTheDocument();
  });

  it('toggle "Mostrar archivados" reveals archived workers in current tab', async () => {
    vi.mocked(listWorkers).mockResolvedValue([
      mkWorker({ first_name: 'A', status: 'approved' }),
      mkWorker({ first_name: 'B', status: 'approved', archived_at: '2026-05-18T10:00:00Z' }),
    ]);
    render(<AgendaTabs />);
    await screen.findByText(/A López/);
    expect(screen.queryByText(/B López/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(/mostrar archivados/i));
    expect(await screen.findByText(/B López/)).toBeInTheDocument();
  });

  it('search filters by name', async () => {
    vi.mocked(listWorkers).mockResolvedValue([
      mkWorker({ first_name: 'Ana', status: 'approved' }),
      mkWorker({ first_name: 'Beto', status: 'approved' }),
    ]);
    render(<AgendaTabs />);
    await screen.findByText(/Ana López/);
    await userEvent.type(screen.getByPlaceholderText(/buscar/i), 'Beto');
    expect(screen.queryByText(/Ana López/)).not.toBeInTheDocument();
    expect(screen.getByText(/Beto López/)).toBeInTheDocument();
  });

  it('approve action calls approveWorker and refetches', async () => {
    const pending = mkWorker({ first_name: 'A', status: 'pending' });
    vi.mocked(listWorkers)
      .mockResolvedValueOnce([pending])
      .mockResolvedValueOnce([{ ...pending, status: 'approved', approved_at: '2026-05-18T00:00:00Z' }]);
    vi.mocked(approveWorker).mockResolvedValue({ ok: true });
    render(<AgendaTabs />);
    await userEvent.click(screen.getByRole('button', { name: /pendientes/i }));
    await screen.findByText(/A López/);
    await userEvent.click(screen.getByRole('button', { name: /aprobar/i }));
    expect(approveWorker).toHaveBeenCalledWith(pending.id);
    await vi.waitFor(() => expect(listWorkers).toHaveBeenCalledTimes(2));
  });

  it('reject action confirms, calls rejectWorker, refetches', async () => {
    const pending = mkWorker({ first_name: 'A', status: 'pending' });
    vi.mocked(listWorkers)
      .mockResolvedValueOnce([pending])
      .mockResolvedValueOnce([{ ...pending, status: 'rejected', archived_at: '2026-05-18T00:00:00Z' }]);
    vi.mocked(rejectWorker).mockResolvedValue(undefined);
    render(<AgendaTabs />);
    await userEvent.click(screen.getByRole('button', { name: /pendientes/i }));
    await screen.findByText(/A López/);
    await userEvent.click(screen.getByRole('button', { name: /rechazar/i }));
    expect(window.confirm).toHaveBeenCalled();
    expect(rejectWorker).toHaveBeenCalledWith(pending.id);
    await vi.waitFor(() => expect(listWorkers).toHaveBeenCalledTimes(2));
  });

  it('opens worker detail modal on Ver click', async () => {
    vi.mocked(listWorkers).mockResolvedValue([mkWorker({ first_name: 'Ana', status: 'approved' })]);
    render(<AgendaTabs />);
    await userEvent.click(await screen.findByRole('button', { name: /ver/i }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('shows error banner when listWorkers throws', async () => {
    vi.mocked(listWorkers).mockRejectedValue(new Error('rls denied'));
    render(<AgendaTabs />);
    expect(await screen.findByText(/error al cargar/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr test y verificar que falla**

Run: `npm run test:run -- src/features/workers/AgendaTabs.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar `src/features/workers/AgendaTabs.tsx`**

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AgendaTable } from './AgendaTable';
import { WorkerDetailModal } from './WorkerDetailModal';
import { approveWorker, archiveWorker, listWorkers, rejectWorker } from './api';
import type { Worker } from './types';

type Tab = 'approved' | 'pending';

export function AgendaTabs() {
  const [tab, setTab] = useState<Tab>('approved');
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState('');
  const [workers, setWorkers] = useState<Worker[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [detail, setDetail] = useState<Worker | null>(null);

  const refetch = useCallback(async () => {
    setError(null);
    try {
      const data = await listWorkers();
      setWorkers(data);
    } catch (e) {
      setError(String(e));
      setWorkers([]);
    }
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  const pendingCount = useMemo(
    () => (workers ?? []).filter((w) => w.archived_at === null && w.status === 'pending').length,
    [workers],
  );

  const visible = useMemo(() => {
    if (!workers) return [];
    const term = search.trim().toLowerCase();
    return workers
      .filter((w) => (showArchived ? w.archived_at !== null : w.archived_at === null))
      .filter((w) => {
        if (showArchived) return true; // archivados: cualquiera (la pestaña no aplica a su estado original)
        return tab === 'approved' ? w.status === 'approved' : w.status === 'pending';
      })
      .filter((w) => {
        if (!term) return true;
        return (
          w.first_name.toLowerCase().includes(term) ||
          w.last_name.toLowerCase().includes(term) ||
          w.email.toLowerCase().includes(term)
        );
      });
  }, [workers, tab, showArchived, search]);

  async function handleApprove(id: string) {
    setActionError(null);
    const r = await approveWorker(id);
    if (!r.ok) { setActionError(r.message ?? r.error); return; }
    if (r.email_warning) setActionError('Aprobado, pero el email de bienvenida no se envió. Revisa la configuración de Resend.');
    await refetch();
  }

  async function handleReject(id: string) {
    if (!window.confirm('¿Rechazar este candidato? No se enviará ningún email.')) return;
    setActionError(null);
    try {
      await rejectWorker(id);
      await refetch();
    } catch (e) { setActionError(String(e)); }
  }

  async function handleArchive(id: string) {
    if (!window.confirm('¿Archivar este candidato?')) return;
    setActionError(null);
    try {
      await archiveWorker(id);
      await refetch();
    } catch (e) { setActionError(String(e)); }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 border-b">
        <button
          type="button"
          onClick={() => setTab('approved')}
          className={`px-4 py-2 ${tab === 'approved' ? 'border-b-2 border-black font-semibold' : 'text-gray-600'}`}
        >
          Aprobados
        </button>
        <button
          type="button"
          onClick={() => setTab('pending')}
          className={`px-4 py-2 flex items-center gap-2 ${tab === 'pending' ? 'border-b-2 border-black font-semibold' : 'text-gray-600'}`}
        >
          Pendientes
          {pendingCount > 0 && (
            <span className="text-xs bg-yellow-200 text-yellow-900 rounded-full px-2 py-0.5">{pendingCount}</span>
          )}
        </button>
      </div>

      <div className="flex items-center gap-4 mb-4">
        <input
          type="text"
          placeholder="Buscar por nombre o email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border p-2 rounded w-full max-w-sm"
        />
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Mostrar archivados
        </label>
      </div>

      {error && <p className="text-red-600 mb-4">Error al cargar candidatos: {error}</p>}
      {actionError && <p className="text-red-600 mb-4">{actionError}</p>}

      {workers === null && !error ? (
        <p className="text-gray-500">Cargando…</p>
      ) : (
        <AgendaTable
          workers={visible}
          onApprove={handleApprove}
          onReject={handleReject}
          onArchive={handleArchive}
          onView={setDetail}
        />
      )}

      <WorkerDetailModal worker={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
```

- [ ] **Step 4: Refactor `src/routes/admin/agenda.tsx`**

```tsx
import { AgendaTabs } from '../../features/workers/AgendaTabs';

export default function AdminAgenda() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Agenda de candidatos</h1>
      <AgendaTabs />
    </div>
  );
}
```

- [ ] **Step 5: Correr tests y verificar que pasan**

Run: `npm run test:run -- src/features/workers/AgendaTabs.test.tsx`
Expected: PASS.

Run: `npm run test:run`
Expected: todos PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/workers/AgendaTabs.tsx src/routes/admin/agenda.tsx src/features/workers/AgendaTabs.test.tsx
git commit -m "feat(admin): /admin/agenda con tabs, busqueda, archivado y modal"
```

---

### Task 10: Actualizar `App.test.tsx` + smoke test build

**Files:**
- Modify: `src/App.test.tsx`

- [ ] **Step 1: Reemplazar `src/App.test.tsx` con la nueva suite**

El test actual usa `createMemoryRouter(routes, { initialEntries: [...] })` y valida que login/redirect funcionan. Mantén esos dos tests y añade tres nuevos para las rutas públicas, mockeando la API de workers para no hacer fetch real.

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { vi } from "vitest";
import { routes } from "./App";

vi.mock("./features/workers/api", () => ({
  lookupCompanyBySlug: vi.fn().mockResolvedValue({ ok: false, error: "not_found" }),
  verifyWorkerRegistration: vi.fn().mockResolvedValue({ ok: false, error: "invalid_token" }),
}));

describe("App routing", () => {
  it("renders the login page when navigating to /login", () => {
    const router = createMemoryRouter(routes, { initialEntries: ["/login"] });
    render(<RouterProvider router={router} />);
    expect(screen.getByRole("heading", { name: /entrar/i })).toBeInTheDocument();
  });

  it("redirects / to /login", () => {
    const router = createMemoryRouter(routes, { initialEntries: ["/"] });
    render(<RouterProvider router={router} />);
    expect(screen.getByRole("heading", { name: /entrar/i })).toBeInTheDocument();
  });

  it("resolves /candidato/registro without auth redirect", async () => {
    const router = createMemoryRouter(routes, { initialEntries: ["/candidato/registro?company=x"] });
    render(<RouterProvider router={router} />);
    // No debe redirigir a /login (no hay heading "Entrar").
    expect(screen.queryByRole("heading", { name: /entrar/i })).not.toBeInTheDocument();
    // El mock de lookupCompanyBySlug devuelve not_found → "Empresa no encontrada".
    await waitFor(() => expect(screen.getByText(/empresa no encontrada/i)).toBeInTheDocument());
  });

  it("resolves /candidato/registro-enviado without auth redirect", () => {
    const router = createMemoryRouter(routes, { initialEntries: ["/candidato/registro-enviado"] });
    render(<RouterProvider router={router} />);
    expect(screen.queryByRole("heading", { name: /entrar/i })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /revisa tu correo/i })).toBeInTheDocument();
  });

  it("resolves /candidato/verificar without auth redirect", async () => {
    const router = createMemoryRouter(routes, { initialEntries: ["/candidato/verificar?token=x"] });
    render(<RouterProvider router={router} />);
    expect(screen.queryByRole("heading", { name: /entrar/i })).not.toBeInTheDocument();
    // El mock de verifyWorkerRegistration devuelve invalid_token → "enlace no es válido".
    await waitFor(() => expect(screen.getByText(/enlace no es válido/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Correr todos los tests**

Run: `npm run test:run`
Expected: todos PASS, incluidos los nuevos.

- [ ] **Step 3: Verificar build production**

Run: `npm run build`
Expected: build OK, sin errores TS.

- [ ] **Step 4: Smoke test manual local**

Levantar dev server: `npm run dev`.

Verificar en navegador:
1. `http://localhost:5173/candidato/registro` → "Falta el parámetro company".
2. `http://localhost:5173/candidato/registro?company=ghost` → "Empresa no encontrada" (asumiendo slug no existe en cloud).
3. `http://localhost:5173/candidato/registro?company=<slug-real>` → form aparece.
4. Login como admin → `/admin/agenda` → tabs y tabla renderizan (puede estar vacío).

NOTA: si el dev server no apunta a Supabase real con datos, los smokes 2-4 quedan limitados. Documentar como TODO antes del E2E manual.

- [ ] **Step 5: Commit**

```bash
git add src/App.test.tsx
git commit -m "test(app): verificar rutas /candidato/* sin redirect a login"
```

---

## Pasos finales (fuera de subagent-driven; controlador los hace)

1. **Push del feature branch** (PEDIR CONFIRMACIÓN AL USUARIO antes).
2. **PR feat → develop** (Cloudflare hace preview deploy automático).
3. **Pedir al usuario** que ejecute el E2E manual de la spec §8 contra la preview.
4. **PR develop → main** tras OK.
5. **Tag `v0.2.0-m2-fase-1`** sobre main (cerrando Fase 1 completa de M2).
6. **Mergear** la rama `docs/m2-phase-1b-spec` a develop → main en paralelo o como parte del PR feat.

## Self-review checklist (controlador)

Tras ejecutar todas las tasks:
- [ ] Spec coverage: cada criterio de aceptación §7 del spec tiene su test correspondiente o queda cubierto por el E2E manual.
- [ ] Sin TODOs ni placeholders en el código entregado.
- [ ] Consistencia de tipos: `LanguageOption`, `Worker`, `RequestRegistrationInput` se importan desde un único lugar (`features/workers/types.ts` o re-exports en `api.ts`).
- [ ] Sin imports muertos.
- [ ] `npm run build` y `npm run test:run` verdes en CI tras el push.
