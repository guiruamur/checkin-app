import { EventosList } from '../../features/eventos/EventosList';

export default function AdminEventos() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Eventos</h1>
      <EventosList />
    </div>
  );
}
