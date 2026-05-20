import type { Client } from './types';

type Props = {
  clients: Client[];
  onEdit: (client: Client) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
};

export function ClientesTable({ clients, onEdit, onArchive, onRestore }: Props) {
  if (clients.length === 0) {
    return <p className="text-gray-500 py-8 text-center">Sin clientes en esta vista.</p>;
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left">
          <th className="py-2 pr-4">Nombre</th>
          <th className="py-2 pr-4">Email de contacto</th>
          <th className="py-2 pr-4">Teléfono</th>
          <th className="py-2">Acciones</th>
        </tr>
      </thead>
      <tbody>
        {clients.map((c) => {
          const archived = c.archived_at !== null;
          return (
            <tr key={c.id} className="border-b">
              <td className="py-2 pr-4">{c.name}</td>
              <td className="py-2 pr-4">{c.contact_email}</td>
              <td className="py-2 pr-4">{c.phone ?? '—'}</td>
              <td className="py-2 space-x-2">
                {archived ? (
                  <button type="button" className="text-green-700 underline" onClick={() => onRestore(c.id)}>Restaurar</button>
                ) : (
                  <>
                    <button type="button" className="text-blue-600 underline" onClick={() => onEdit(c)}>Editar</button>
                    <button type="button" className="text-gray-700 underline" onClick={() => onArchive(c.id)}>Archivar</button>
                  </>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
