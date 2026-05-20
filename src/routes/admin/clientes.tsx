import { ClientesList } from '../../features/clientes/ClientesList';

export default function AdminClientes() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Clientes</h1>
      <ClientesList />
    </div>
  );
}
