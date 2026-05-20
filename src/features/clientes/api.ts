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
