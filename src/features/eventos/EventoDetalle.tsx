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
