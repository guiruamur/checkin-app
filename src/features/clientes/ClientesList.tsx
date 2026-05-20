import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from '../../components/Modal';
import { ClientesTable } from './ClientesTable';
import { ClienteForm } from './ClienteForm';
import { archiveClient, createClient, listClients, restoreClient, updateClient, type ClientInput } from './api';
import type { Client } from './types';

type ModalState =
  | { kind: 'closed' }
  | { kind: 'create' }
  | { kind: 'edit'; client: Client };

export function ClientesList() {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [modal, setModal] = useState<ModalState>({ kind: 'closed' });

  const refetch = useCallback(async () => {
    setError(null);
    try {
      setClients(await listClients());
    } catch (e) {
      setError(String(e));
      setClients([]);
    }
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  const visible = useMemo(() => {
    if (!clients) return [];
    const term = search.trim().toLowerCase();
    return clients
      .filter((c) => (showArchived ? c.archived_at !== null : c.archived_at === null))
      .filter((c) => {
        if (!term) return true;
        return c.name.toLowerCase().includes(term) || c.contact_email.toLowerCase().includes(term);
      });
  }, [clients, search, showArchived]);

  async function handleSubmit(input: ClientInput) {
    setActionError(null);
    try {
      if (modal.kind === 'edit') await updateClient(modal.client.id, input);
      else await createClient(input);
      setModal({ kind: 'closed' });
      await refetch();
    } catch (e) {
      setActionError(String(e));
    }
  }

  async function handleArchive(id: string) {
    if (!window.confirm('¿Archivar este cliente?')) return;
    setActionError(null);
    try {
      await archiveClient(id);
      await refetch();
    } catch (e) { setActionError(String(e)); }
  }

  async function handleRestore(id: string) {
    setActionError(null);
    try {
      await restoreClient(id);
      await refetch();
    } catch (e) { setActionError(String(e)); }
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-4">
        <input
          type="text"
          placeholder="Buscar por nombre o email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border p-2 rounded w-full max-w-sm"
        />
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Mostrar archivados
        </label>
        <button
          type="button"
          onClick={() => setModal({ kind: 'create' })}
          className="ml-auto bg-black text-white px-4 py-2 rounded"
        >
          + Nuevo cliente
        </button>
      </div>

      {error && <p className="text-red-600 mb-4">Error al cargar clientes: {error}</p>}
      {actionError && <p className="text-red-600 mb-4">{actionError}</p>}

      {clients === null && !error ? (
        <p className="text-gray-500">Cargando…</p>
      ) : (
        <ClientesTable
          clients={visible}
          onEdit={(client) => setModal({ kind: 'edit', client })}
          onArchive={handleArchive}
          onRestore={handleRestore}
        />
      )}

      <Modal
        open={modal.kind !== 'closed'}
        onClose={() => setModal({ kind: 'closed' })}
        title={modal.kind === 'edit' ? 'Editar cliente' : 'Nuevo cliente'}
      >
        {modal.kind !== 'closed' && (
          <ClienteForm
            client={modal.kind === 'edit' ? modal.client : undefined}
            onSubmit={handleSubmit}
            onCancel={() => setModal({ kind: 'closed' })}
          />
        )}
      </Modal>
    </div>
  );
}
