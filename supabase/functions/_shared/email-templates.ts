// Templates HTML embebidos como string. Placeholders {{var}} resueltos por
// el helper renderTemplate de _shared/resend.ts.
//
// Mobile-friendly, estilos inline para compatibilidad Gmail/Outlook.
// El diseño visual final llegará en fases posteriores (Stitch).

export const workerVerificationTemplate = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirma tu inscripción</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #111;">
  <h2 style="color: #111;">Confirma tu inscripción en {{company_name}}</h2>
  <p>Hola,</p>
  <p>Has solicitado inscribirte en la agenda de candidatos de <strong>{{company_name}}</strong>. Para completar tu registro, pulsa el botón:</p>
  <p style="text-align: center; margin: 30px 0;">
    <a href="{{verify_url}}" style="background: #000; color: #fff; padding: 14px 28px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">Confirmar inscripción</a>
  </p>
  <p style="font-size: 14px; color: #666;">O copia esta URL en tu navegador:<br><code style="word-break: break-all;">{{verify_url}}</code></p>
  <p style="font-size: 14px; color: #999; margin-top: 30px; border-top: 1px solid #eee; padding-top: 16px;">El enlace caduca en 24 horas. Si no fuiste tú, ignora este email.</p>
</body>
</html>`;

export const workerApprovedTemplate = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Estás aprobado</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #111;">
  <h2 style="color: #111;">¡Bienvenido a {{company_name}}, {{worker_first_name}}!</h2>
  <p>Te hemos aprobado en nuestra agenda de candidatos. Cuando tengamos un evento donde encajes, te avisaremos por email con los detalles.</p>
  <p>No tienes que hacer nada por ahora. Ya estás en nuestra lista activa.</p>
  <p style="font-size: 14px; color: #999; margin-top: 30px; border-top: 1px solid #eee; padding-top: 16px;">Si tienes alguna duda, responde a este email.</p>
</body>
</html>`;
