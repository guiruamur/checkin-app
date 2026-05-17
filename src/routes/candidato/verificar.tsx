import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { verifyWorkerRegistration } from '../../features/workers/api';

type State =
  | { kind: 'loading' }
  | { kind: 'missing_token' }
  | { kind: 'success'; companyName: string }
  | { kind: 'error'; error: 'invalid_token' | 'token_expired' | 'company_not_found' | 'registration_failed' | 'validation' | 'network' | 'unknown' };

export default function CandidatoVerificar() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    if (!token) { setState({ kind: 'missing_token' }); return; }
    (async () => {
      const r = await verifyWorkerRegistration(token);
      if (cancelled) return;
      if (r.ok) setState({ kind: 'success', companyName: r.company_name });
      else setState({ kind: 'error', error: r.error });
    })();
    return () => { cancelled = true; };
  }, [token]);

  return (
    <div className="max-w-xl mx-auto p-8 text-center">
      {state.kind === 'loading' && <p>Verificando…</p>}
      {state.kind === 'missing_token' && (
        <p className="text-red-600">Este enlace no válido o ha expirado.</p>
      )}
      {state.kind === 'success' && (
        <>
          <h1 className="text-2xl font-bold mb-4">¡Gracias por inscribirte en {state.companyName}!</h1>
          <p className="text-gray-700">
            Estudiaremos tu candidatura y nos pondremos en contacto pronto.
          </p>
        </>
      )}
      {state.kind === 'error' && (
        <p className="text-red-600">
          {state.error === 'token_expired' && 'Este enlace ha caducado. Vuelve a empezar el registro.'}
          {state.error === 'invalid_token' && 'Este enlace no es válido.'}
          {state.error === 'company_not_found' && 'Empresa no encontrada.'}
          {(state.error === 'registration_failed' || state.error === 'validation' || state.error === 'network' || state.error === 'unknown') &&
            'Hubo un problema. Inténtalo más tarde.'}
        </p>
      )}
    </div>
  );
}
