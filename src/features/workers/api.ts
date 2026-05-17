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
  // RLS filtra por company_id automáticamente vía JWT claim.
  // database.ts no incluye 'workers' aún (regen pendiente al cierre de M2).
  const { data, error } = await supabase
    .from('workers')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // database.ts no incluye 'workers' aún (regen al cierre de M2).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ status: 'rejected', archived_at: new Date().toISOString() } as any)
    .eq('id', workerId);
  if (error) throw new Error(error.message);
}

// --- archiveWorker (admin, supabase-js directo, preserva status) ---
export async function archiveWorker(workerId: string): Promise<void> {
  const { error } = await supabase
    .from('workers')
    // database.ts no incluye 'workers' aún (regen al cierre de M2).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ archived_at: new Date().toISOString() } as any)
    .eq('id', workerId);
  if (error) throw new Error(error.message);
}
