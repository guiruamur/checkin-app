import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { z } from "https://esm.sh/zod@3.23.8";
import { corsHeaders } from "../_shared/cors.ts";
import { signVerificationToken } from "../_shared/jwt.ts";
import { renderTemplate, sendEmail } from "../_shared/resend.ts";
import { workerVerificationTemplate } from "../_shared/email-templates.ts";

const bodySchema = z.object({
  company_slug: z.string().min(1),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().regex(/^\+?[0-9]{9,15}$/),
  postal_code: z.string().regex(/^\d{5}$/).optional(),
  languages: z.array(z.enum([
    "español", "catalán", "inglés", "francés", "alemán", "italiano",
    "portugués", "gallego", "euskera", "árabe", "chino", "ruso", "otros",
  ])).max(8),
  experience_summary: z.string().max(500).optional(),
  website: z.string().length(0),  // honeypot
});

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

  // Honeypot check is enforced by Zod schema (website must be length 0).
  // If Zod passed, website is empty.

  const admin = adminOverride ?? createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: company } = await admin
    .from("companies")
    .select("id, name")
    .eq("slug", body.company_slug)
    .maybeSingle();

  if (!company) {
    return new Response(
      JSON.stringify({ error: "company_not_found" }),
      { status: 404, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }

  // Strip honeypot and slug from form_data
  const { website: _w, company_slug: _s, ...formData } = body;

  const token = await signVerificationToken(
    { form_data: formData, company_id: company.id },
    86400,  // 24h
  );

  const siteUrl = Deno.env.get("SITE_URL") ?? "http://localhost:5173";
  const verifyUrl = `${siteUrl}/candidato/verificar?token=${token}`;

  const html = renderTemplate(workerVerificationTemplate, {
    company_name: company.name,
    verify_url: verifyUrl,
  });

  try {
    await sendEmail({
      companyId: company.id,
      to: body.email,
      subject: `Confirma tu inscripción en ${company.name}`,
      html,
    }, admin);
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "email_send_failed", message: String(e) }),
      { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }

  return new Response(null, { status: 200, headers: corsHeaders });
}

if (import.meta.main) {
  Deno.serve((req) => handler(req));
}
