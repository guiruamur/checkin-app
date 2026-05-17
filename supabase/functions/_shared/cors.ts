// Headers CORS reutilizables por todas las Edge Functions.
// En producción, ajustar Allow-Origin al dominio de la SPA si queremos
// restringir; por ahora es * para permitir local dev + Cloudflare Pages.
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
