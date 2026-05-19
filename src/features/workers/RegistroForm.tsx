import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { LANGUAGE_OPTIONS, type LanguageOption } from './types';

const schema = z.object({
  first_name: z.string().min(1, 'Obligatorio'),
  last_name: z.string().min(1, 'Obligatorio'),
  email: z.string().min(1, 'Obligatorio').email('Email inválido'),
  phone: z.string().regex(/^\+?[0-9]{9,15}$/, 'Teléfono inválido (9-15 dígitos)'),
  postal_code: z
    .string()
    .regex(/^\d{5}$/, 'Código postal inválido (5 dígitos)')
    .or(z.literal(''))
    .optional(),
  languages: z
    .array(z.enum(LANGUAGE_OPTIONS))
    .min(1, 'Selecciona al menos un idioma')
    .max(8, 'Máximo 8 idiomas'),
  experience_summary: z
    .string()
    .max(500, 'Máximo 500 caracteres')
    .or(z.literal(''))
    .optional(),
  website: z.string().optional(),
});

export type RegistroFormValues = z.infer<typeof schema>;

export type RegistroFormPayload = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  postal_code?: string;
  languages: LanguageOption[];
  experience_summary?: string;
  website?: string;
};

type Props = {
  onSubmit: (payload: RegistroFormPayload) => Promise<void> | void;
};

export function RegistroForm({ onSubmit }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegistroFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { languages: [], website: '' },
  });

  async function handle(values: RegistroFormValues) {
    const payload: RegistroFormPayload = {
      first_name: values.first_name,
      last_name: values.last_name,
      email: values.email,
      phone: values.phone,
      languages: values.languages,
      ...(values.postal_code ? { postal_code: values.postal_code } : {}),
      ...(values.experience_summary ? { experience_summary: values.experience_summary } : {}),
      ...(values.website ? { website: values.website } : {}),
    };
    await onSubmit(payload);
  }

  return (
    <form onSubmit={handleSubmit(handle)} className="space-y-4">
      <div>
        <label htmlFor="first_name" className="block mb-1">Nombre</label>
        <input id="first_name" {...register('first_name')} className="border w-full p-2 rounded" />
        {errors.first_name && <p className="text-red-600 text-sm">{errors.first_name.message}</p>}
      </div>

      <div>
        <label htmlFor="last_name" className="block mb-1">Apellidos</label>
        <input id="last_name" {...register('last_name')} className="border w-full p-2 rounded" />
        {errors.last_name && <p className="text-red-600 text-sm">{errors.last_name.message}</p>}
      </div>

      <div>
        <label htmlFor="email" className="block mb-1">Email</label>
        <input id="email" type="email" {...register('email')} className="border w-full p-2 rounded" />
        {errors.email && <p className="text-red-600 text-sm">{errors.email.message}</p>}
      </div>

      <div>
        <label htmlFor="phone" className="block mb-1">Teléfono</label>
        <input id="phone" type="tel" {...register('phone')} className="border w-full p-2 rounded" />
        {errors.phone && <p className="text-red-600 text-sm">{errors.phone.message}</p>}
      </div>

      <div>
        <label htmlFor="postal_code" className="block mb-1">Código postal (opcional)</label>
        <input id="postal_code" {...register('postal_code')} className="border w-full p-2 rounded" />
        {errors.postal_code && <p className="text-red-600 text-sm">{errors.postal_code.message}</p>}
      </div>

      <fieldset>
        <legend className="mb-1">Idiomas</legend>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {LANGUAGE_OPTIONS.map((lang) => (
            <label key={lang} className="flex items-center gap-2">
              <input
                type="checkbox"
                value={lang}
                {...register('languages')}
                aria-label={lang}
              />
              <span>{lang}</span>
            </label>
          ))}
        </div>
        {errors.languages && <p className="text-red-600 text-sm">{errors.languages.message}</p>}
      </fieldset>

      <div>
        <label htmlFor="experience_summary" className="block mb-1">Experiencia (opcional)</label>
        <textarea
          id="experience_summary"
          {...register('experience_summary')}
          className="border w-full p-2 rounded"
          rows={4}
          maxLength={500}
        />
        {errors.experience_summary && <p className="text-red-600 text-sm">{errors.experience_summary.message}</p>}
      </div>

      {/* Honeypot: input visible para bots, invisible para humanos */}
      <input
        type="text"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute left-[-9999px] w-px h-px overflow-hidden"
        {...register('website')}
      />

      <button
        type="submit"
        disabled={isSubmitting}
        className="bg-black text-white px-4 py-2 rounded disabled:opacity-50"
      >
        {isSubmitting ? 'Enviando…' : 'Enviar inscripción'}
      </button>
    </form>
  );
}
