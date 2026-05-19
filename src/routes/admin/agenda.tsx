import { AgendaTabs } from '../../features/workers/AgendaTabs';

export default function AdminAgenda() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Agenda de candidatos</h1>
      <AgendaTabs />
    </div>
  );
}
