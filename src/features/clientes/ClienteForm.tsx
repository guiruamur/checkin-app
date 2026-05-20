import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { Client } from './types';
import type { ClientInput } from './api';

const schema = z.object({
  name: z.string().min(1, 'Obligatorio'),
  contact_email: z.string().min(1, 'Obligatorio').email('Email inválido'),
  phone: z.string().regex(/^\+?[0-9\s-]{7,20}$/, 'Teléfono inválido').or(z.literal('')).optional(),
  notes: z.string().max(1000, 'Máximo 1000 caracteres').or(z.literal('')).optional(),
});

type FormValues = z.infer<typeof schema>;

type Props = {
  client?: Client;
  onSubmit: (input: ClientInput) => Promise<void> | void;
  onCancel: () => void;
};

export function ClienteForm({ client, onSubmit, onCancel }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: client?.name ?? '',
      contact_email: client?.contact_email ?? '',
      phone: client?.phone ?? '',
      notes: client?.notes ?? '',
    },
  });

  async function handle(values: FormValues) {
    const input: ClientInput = {
      name: values.name,
      contact_email: values.contact_email,
      ...(values.phone ? { phone: values.phone } : {}),
      ...(values.notes ? { notes: values.notes } : {}),
    };
    await onSubmit(input);
  }

  return (
    <form onSubmit={handleSubmit(handle)} className="space-y-4">
      <div>
        <label htmlFor="name" className="block mb-1">Nombre</label>
        <input id="name" {...register('name')} className="border w-full p-2 rounded" />
        {errors.name && <p className="text-red-600 text-sm">{errors.name.message}</p>}
      </div>

      <div>
        <label htmlFor="contact_email" className="block mb-1">Email de contacto</label>
        <input id="contact_email" {...register('contact_email')} className="border w-full p-2 rounded" />
        {errors.contact_email && <p className="text-red-600 text-sm">{errors.contact_email.message}</p>}
      </div>

      <div>
        <label htmlFor="phone" className="block mb-1">Teléfono (opcional)</label>
        <input id="phone" type="tel" {...register('phone')} className="border w-full p-2 rounded" />
        {errors.phone && <p className="text-red-600 text-sm">{errors.phone.message}</p>}
      </div>

      <div>
        <label htmlFor="notes" className="block mb-1">Notas (opcional)</label>
        <textarea id="notes" {...register('notes')} className="border w-full p-2 rounded" rows={4} maxLength={1000} />
        {errors.notes && <p className="text-red-600 text-sm">{errors.notes.message}</p>}
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
