import { useParams } from 'react-router-dom';
import { EventoDetalle } from '../../features/eventos/EventoDetalle';

export default function AdminEventoDetalle() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <p className="text-red-600">Falta el id del evento.</p>;
  return <EventoDetalle eventId={id} />;
}
