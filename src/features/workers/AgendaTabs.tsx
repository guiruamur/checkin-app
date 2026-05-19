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
