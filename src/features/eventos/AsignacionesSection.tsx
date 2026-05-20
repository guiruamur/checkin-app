import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addAssignment, listApprovedWorkers, listAssignments, removeAssignment, updateAssignment,
} from './api';
import { toISO, toLocalInput } from './dates';
import type { AssignmentWithWorker } from './types';

type WorkerOption = { id: string; first_name: string; last_name: string };

type Props = {
  eventId: string;
  eventStart: string;  // ISO
  eventEnd: string;    // ISO
};

export function AsignacionesSection({ eventId, eventStart, eventEnd }: Props) {
  const [assignments, setAssignments] = useState<AssignmentWithWorker[] | null>(null);
  const [workers, setWorkers] = useState<WorkerOption[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setError(null);
    try {
      setAssignments(await listAssignments(eventId));
    } catch (e) {
      setError(String(e));
      setAssignments([]);
    }
  }, [eventId]);

  useEffect(() => { refetch(); }, [refetch]);
  useEffect(() => { listApprovedWorkers().then(setWorkers).catch(() => setWorkers([])); }, []);

  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    return workers.filter((w) => `${w.first_name} ${w.last_name}`.toLowerCase().includes(term));
  }, [workers, search]);

  async function handleAdd(workerId: string) {
    setError(null);
    try {
      await addAssignment(eventId, workerId, eventStart, eventEnd);
      setSearch('');
      await refetch();
    } catch (e) { setError(String(e)); }
  }

  async function handleDuplicate(a: AssignmentWithWorker) {
    setError(null);
    try {
      await addAssignment(eventId, a.worker_id, a.scheduled_start, a.scheduled_end);
      await refetch();
    } catch (e) { setError(String(e)); }
  }

  async function handleScheduleChange(id: string, start: string, end: string) {
    setError(null);
    try {
      await updateAssignment(id, start, end);
      await refetch();
    } catch (e) { setError(String(e)); }
  }

  async function handleRemove(id: string) {
    if (!window.confirm('¿Quitar esta asignación?')) return;
    setError(null);
    try {
      await removeAssignment(id);
      await refetch();
    } catch (e) { setError(String(e)); }
  }

  return (
    <div className="mt-6">
      <h2 className="text-lg font-semibold mb-3">Trabajadores asignados</h2>

      <div className="mb-4 relative max-w-sm">
        <input
          type="text"
          placeholder="Buscar trabajador para añadir…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border p-2 rounded w-full"
        />
        {matches.length > 0 && (
          <ul className="absolute z-10 bg-white border rounded w-full mt-1 max-h-48 overflow-y-auto">
            {matches.map((w) => (
              <li key={w.id}>
                <button
                  type="button"
                  onClick={() => handleAdd(w.id)}
                  className="block w-full text-left px-3 py-2 hover:bg-gray-100"
                  aria-label={`Añadir ${w.first_name} ${w.last_name}`}
                >
                  {w.first_name} {w.last_name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <p className="text-red-600 mb-4">{error}</p>}

      {assignments === null ? (
        <p className="text-gray-500">Cargando…</p>
      ) : assignments.length === 0 ? (
        <p className="text-gray-500 py-4">Sin trabajadores asignados.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2 pr-4">Trabajador</th>
              <th className="py-2 pr-4">Inicio</th>
              <th className="py-2 pr-4">Fin</th>
              <th className="py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((a) => (
              <tr key={a.id} className="border-b">
                <td className="py-2 pr-4">{a.workers?.first_name} {a.workers?.last_name}</td>
                <td className="py-2 pr-4">
                  <input
                    type="datetime-local"
                    defaultValue={toLocalInput(a.scheduled_start)}
                    onBlur={(e) => handleScheduleChange(a.id, toISO(e.target.value), a.scheduled_end)}
                    className="border p-1 rounded"
                    aria-label={`Inicio de ${a.workers?.first_name}`}
                  />
                </td>
                <td className="py-2 pr-4">
                  <input
                    type="datetime-local"
                    defaultValue={toLocalInput(a.scheduled_end)}
                    onBlur={(e) => handleScheduleChange(a.id, a.scheduled_start, toISO(e.target.value))}
                    className="border p-1 rounded"
                    aria-label={`Fin de ${a.workers?.first_name}`}
                  />
                </td>
                <td className="py-2 space-x-2">
                  <button type="button" className="text-blue-600 underline" onClick={() => handleDuplicate(a)}>Duplicar</button>
                  <button type="button" className="text-red-700 underline" onClick={() => handleRemove(a.id)}>Quitar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
