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
