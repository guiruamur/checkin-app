import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { RegistroForm, type RegistroFormPayload } from '../../features/workers/RegistroForm';
import { lookupCompanyBySlug, requestWorkerRegistration } from '../../features/workers/api';

type LookupState =
  | { kind: 'loading' }
  | { kind: 'missing_slug' }
  | { kind: 'not_found' }
  | { kind: 'error'; message?: string }
  | { kind: 'ok'; name: string };

export default function CandidatoRegistro() {
  const [searchParams] = useSearchParams();
  const slug = searchParams.get('company');
  const navigate = useNavigate();
  const [lookup, setLookup] = useState<LookupState>({ kind: 'loading' });
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!slug) {
      setLookup({ kind: 'missing_slug' });
      return;
    }
    (async () => {
      const r = await lookupCompanyBySlug(slug);
      if (cancelled) return;
      if (r.ok) setLookup({ kind: 'ok', name: r.name });
      else if (r.error === 'not_found') setLookup({ kind: 'not_found' });
      else setLookup({ kind: 'error', message: r.message });
    })();
    return () => { cancelled = true; };
  }, [slug]);

  async function handleSubmit(payload: RegistroFormPayload) {
    if (lookup.kind !== 'ok' || !slug) return;
    setSubmitError(null);
    const r = await requestWorkerRegistration({ company_slug: slug, ...payload });
    if (!r.ok) {
      const msg =
        r.error === 'validation' ? 'Datos inválidos. Revisa el formulario.'
        : r.error === 'company_not_found' ? 'Empresa no encontrada.'
        : r.error === 'email_send_failed' ? 'Hubo un problema enviando el email. Inténtalo de nuevo.'
        : r.error === 'network' ? 'Sin conexión. Inténtalo más tarde.'
        : 'Ha ocurrido un error. Inténtalo más tarde.';
      setSubmitError(msg);
      return;
    }
    navigate('/candidato/registro-enviado', { state: { email: payload.email } });
  }

  return (
    <div className="max-w-xl mx-auto p-8">
      {lookup.kind === 'loading' && <p>Cargando…</p>}
      {lookup.kind === 'missing_slug' && (
        <p className="text-red-600">Falta el parámetro <code>company</code> en la URL.</p>
      )}
      {lookup.kind === 'not_found' && <p className="text-red-600">Empresa no encontrada.</p>}
      {lookup.kind === 'error' && (
        <p className="text-red-600">Error al cargar la empresa. Inténtalo más tarde.</p>
      )}
      {lookup.kind === 'ok' && (
        <>
          <h1 className="text-2xl font-bold mb-2">Inscribirme en {lookup.name}</h1>
          <p className="text-gray-600 mb-6">
            Rellena el formulario y te enviaremos un email para confirmar tu inscripción.
          </p>
          {submitError && <p className="text-red-600 mb-4">{submitError}</p>}
          <RegistroForm onSubmit={handleSubmit} />
        </>
      )}
    </div>
  );
}
