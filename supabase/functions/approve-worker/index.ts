import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { z } from "https://esm.sh/zod@3.23.8";
import { corsHeaders } from "../_shared/cors.ts";
import { renderTemplate, sendEmail } from "../_shared/resend.ts";
import { workerApprovedTemplate } from "../_shared/email-templates.ts";

const bodySchema = z.object({
  worker_id: z.string().uuid(),
});

/**
 * Decodifica el payload del JWT del Authorization header sin verificar firma.
 * Supabase ya validó el JWT con verify_jwt=true antes de invocar la function.
 * Aquí solo extraemos el claim company_id que el Auth Hook inyectó.
 */
function getAdminCompanyId(req: Request): string | null {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer /, "").trim();
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = "=".repeat((4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(atob(b64 + pad)) as { company_id?: string };
    return payload.company_id ?? null;
  } catch {
    return null;
  }
}

export default async function handler(
  req: Request,
  adminOverride?: SupabaseClient,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "method_not_allowed" }),
      { status: 405, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }

  // Extraer company_id del JWT del admin (Supabase ya verificó la firma).
  // Este claim viene del Auth Hook custom_access_token_hook configurado en Fase 0.
  const adminCompanyId = getAdminCompanyId(req);
  if (!adminCompanyId) {
    return new Response(
      JSON.stringify({ error: "no_company_claim" }),
      { status: 401, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (e) {
    return new Response(
      JSON.stringify({
        error: "validation",
        details: e instanceof z.ZodError ? e.flatten() : String(e),
      }),
      { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }

  const admin = adminOverride ?? createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // SELECT con filtro EXPLÍCITO por tenant. service_role bypasea RLS, así que
  // este filtro es la barrera anti cross-tenant.
  const { data: worker } = await admin
    .from("workers")
    .select("id, email, first_name, status, company_id")
    .eq("id", body.worker_id)
    .eq("company_id", adminCompanyId)
    .maybeSingle();

  if (!worker) {
    return new Response(
      JSON.stringify({ error: "not_found_or_forbidden" }),
      { status: 403, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }

  if (worker.status !== "pending") {
    return new Response(
      JSON.stringify({ error: "not_pending" }),
      { status: 409, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }

  // UPDATE filtrado por id. La barrera anti cross-tenant ya fue aplicada en el
  // SELECT anterior (que filtró explícitamente por company_id = adminCompanyId).
  const { error: updateErr } = await admin
    .from("workers")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
    })
    .eq("id", body.worker_id);

  if (updateErr) {
    return new Response(
      JSON.stringify({ error: "update_failed", message: updateErr.message }),
      { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }

  // Enviar email de bienvenida — no bloqueante si falla.
  const { data: company } = await admin
    .from("companies")
    .select("name")
    .eq("id", worker.company_id)
    .single();

  const companyName = company?.name ?? "tu empresa";
  const html = renderTemplate(workerApprovedTemplate, {
    company_name: companyName,
    worker_first_name: worker.first_name,
  });

  let emailWarning = false;
  try {
    await sendEmail({
      companyId: worker.company_id,
      to: worker.email,
      subject: `¡Te hemos aprobado en ${companyName}!`,
      html,
    }, admin);
  } catch (e) {
    console.error("[approve-worker] email send failed:", e);
    emailWarning = true;
  }

  return new Response(
    JSON.stringify({ ok: true, ...(emailWarning ? { email_warning: true } : {}) }),
    { status: 200, headers: { ...corsHeaders, "content-type": "application/json" } },
  );
}

if (import.meta.main) {
  Deno.serve((req) => handler(req));
}
