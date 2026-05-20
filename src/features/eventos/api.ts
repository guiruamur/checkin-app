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
