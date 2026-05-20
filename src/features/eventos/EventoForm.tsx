import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { Event } from './types';
import type { EventInput } from './api';
import { toISO, toLocalInput } from './dates';

const schema = z.object({
  client_id: z.string().min(1, 'Selecciona un cliente'),
  name: z.string().min(1, 'Obligatorio'),
  address: z.string().min(1, 'Obligatorio'),
  organizer_email: z.string().min(1, 'Obligatorio').email('Email inválido'),
  starts_at: z.string().min(1, 'Obligatorio'),
  ends_at: z.string().min(1, 'Obligatorio'),
}).refine((d) => d.ends_at > d.starts_at, {
  message: 'El fin debe ser posterior al inicio',
  path: ['ends_at'],
});

type FormValues = z.infer<typeof schema>;

type ClientOption = { id: string; name: string; contact_email: string };

type Props = {
  clients: ClientOption[];
  event?: Event;
  onSubmit: (input: EventInput) => Promise<void> | void;
  onCancel: () => void;
};

export function EventoForm({ clients, event, onSubmit, onCancel }: Props) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      client_id: event?.client_id ?? '',
      name: event?.name ?? '',
      address: event?.address ?? '',
      organizer_email: event?.organizer_email ?? '',
      starts_at: event ? toLocalInput(event.starts_at) : '',
      ends_at: event ? toLocalInput(event.ends_at) : '',
    },
  });

  const clientId = watch('client_id');
  useEffect(() => {
    if (!clientId) return;
    if (getValues('organizer_email')) return;
    const c = clients.find((x) => x.id === clientId);
    if (c) setValue('organizer_email', c.contact_email);
  }, [clientId, clients, getValues, setValue]);

  async function handle(values: FormValues) {
    const input: EventInput = {
      client_id: values.client_id,
      name: values.name,
      address: values.address,
      organizer_email: values.organizer_email,
      starts_at: toISO(values.starts_at),
      ends_at: toISO(values.ends_at),
    };
    await onSubmit(input);
  }

  return (
    <form onSubmit={handleSubmit(handle)} className="space-y-4">
      <div>
        <label htmlFor="client_id" className="block mb-1">Cliente</label>
        <select id="client_id" {...register('client_id')} className="border w-full p-2 rounded">
          <option value="">— Selecciona —</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {errors.client_id && <p className="text-red-600 text-sm">{errors.client_id.message}</p>}
      </div>

      <div>
        <label htmlFor="name" className="block mb-1">Nombre</label>
        <input id="name" {...register('name')} className="border w-full p-2 rounded" />
        {errors.name && <p className="text-red-600 text-sm">{errors.name.message}</p>}
      </div>

      <div>
        <label htmlFor="address" className="block mb-1">Dirección</label>
        <input id="address" {...register('address')} className="border w-full p-2 rounded" />
        {errors.address && <p className="text-red-600 text-sm">{errors.address.message}</p>}
      </div>

      <div>
        <label htmlFor="organizer_email" className="block mb-1">Email del organizador</label>
        <input id="organizer_email" {...register('organizer_email')} className="border w-full p-2 rounded" />
        {errors.organizer_email && <p className="text-red-600 text-sm">{errors.organizer_email.message}</p>}
      </div>

      <div>
        <label htmlFor="starts_at" className="block mb-1">Inicio</label>
        <input id="starts_at" type="datetime-local" {...register('starts_at')} className="border w-full p-2 rounded" />
        {errors.starts_at && <p className="text-red-600 text-sm">{errors.starts_at.message}</p>}
      </div>

      <div>
        <label htmlFor="ends_at" className="block mb-1">Fin</label>
        <input id="ends_at" type="datetime-local" {...register('ends_at')} className="border w-full p-2 rounded" />
        {errors.ends_at && <p className="text-red-600 text-sm">{errors.ends_at.message}</p>}
      </div>

      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded border">Cancelar</button>
        <button type="submit" disabled={isSubmitting} className="bg-black text-white px-4 py-2 rounded disabled:opacity-50">
          {isSubmitting ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  );
}
