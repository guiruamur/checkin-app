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
    if (tab === 'past') rows = [...rows].reverse();
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
