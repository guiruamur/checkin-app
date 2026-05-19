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
