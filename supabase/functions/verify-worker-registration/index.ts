import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { z } from "https://esm.sh/zod@3.23.8";
import { corsHeaders } from "../_shared/cors.ts";
import { verifyVerificationToken } from "../_shared/jwt.ts";

const bodySchema = z.object({
  token: z.string().min(1),
});

type TokenPayload = {
  form_data: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    postal_code?: string;
    languages: string[];
    experience_summary?: string;
  };
  company_id: string;
  exp: number;
};

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
  } catch {
    return new Response(
      JSON.stringify({ error: "validation" }),
      { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }

  let payload: TokenPayload;
  try {
    payload = await verifyVerificationToken<TokenPayload>(body.token);
  } catch (e) {
    const msg = String(e).toLowerCase();
    const code = msg.includes("exp") ? "token_expired" : "invalid_token";
    return new Response(
      JSON.stringify({ error: code }),
      { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }

  const admin = adminOverride ?? createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Resolve company name for response
  const { data: company } = await admin
    .from("companies")
    .select("name")
    .eq("id", payload.company_id)
    .single();

  if (!company) {
    return new Response(
      JSON.stringify({ error: "company_not_found" }),
      { status: 404, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }

  // Check if worker already exists (idempotent)
  const { data: existing } = await admin
    .from("workers")
    .select("id")
    .eq("company_id", payload.company_id)
    .eq("email", payload.form_data.email.toLowerCase())
    .is("archived_at", null)
    .maybeSingle();

  if (!existing) {
    // INSERT new worker (status defaults to 'pending')
    await admin.from("workers").insert({
      company_id: payload.company_id,
      email: payload.form_data.email,
      phone: payload.form_data.phone,
      first_name: payload.form_data.first_name,
      last_name: payload.form_data.last_name,
      postal_code: payload.form_data.postal_code,
      languages: payload.form_data.languages,
      experience_summary: payload.form_data.experience_summary,
    });
  }

  return new Response(
    JSON.stringify({ company_name: company.name }),
    { status: 200, headers: { ...corsHeaders, "content-type": "application/json" } },
  );
}

if (import.meta.main) {
  Deno.serve((req) => handler(req));
}
