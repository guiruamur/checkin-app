import { useLocation } from 'react-router-dom';

export default function CandidatoRegistroEnviado() {
  const location = useLocation();
  const email = (location.state as { email?: string } | null)?.email;

  return (
    <div className="max-w-xl mx-auto p-8 text-center">
      <h1 className="text-2xl font-bold mb-4">Revisa tu correo</h1>
      {email ? (
        <p className="text-gray-700">
          Te hemos enviado un email a <strong>{email}</strong>. Haz click en el enlace
          para confirmar tu inscripción.
        </p>
      ) : (
        <p className="text-gray-700">
          Te hemos enviado un email para confirmar tu inscripción.
        </p>
      )}
      <p className="text-gray-500 mt-4 text-sm">
        Si no lo encuentras revisa la carpeta de SPAM.
      </p>
    </div>
  );
}
