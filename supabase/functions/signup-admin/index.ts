import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { z } from "https://esm.sh/zod@3.23.8";
import { corsHeaders } from "../_shared/cors.ts";

const bodySchema = z.object({
  email: z.string().email("invalid_email"),
  password: z.string().min(8, "password_too_short"),
  company_name: z.string().min(1, "company_name_required"),
  full_name: z.string().min(1, "full_name_required"),
});

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") +
    "-" +
    Date.now().toString(36)
  );
}

// El handler acepta un cliente admin opcional como segundo argumento.
// En producción (Deno.serve abajo) se crea desde env vars con service_role.
// En tests se inyecta un mock para ejercitar la ruta de rollback sin BD real.
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

  // 1. Validar body
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

  const admin =
    adminOverride ??
    createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

  // 2. Crear auth.users
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: body.email,
    password: body.password,
    email_confirm: true,
  });

  if (createErr || !created.user) {
    const code = createErr?.message?.toLowerCase().includes("already")
      ? "email_taken"
      : "auth_create_failed";
    return new Response(
      JSON.stringify({ error: code, message: createErr?.message }),
      { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }

  const userId = created.user.id;
  const slug = slugify(body.company_name);

  // 3. Crear company + admin_user via RPC atómico (una sola transacción).
  // Si falla, basta con borrar el auth.user (no hay company ni admin_user
  // colgando porque el RPC hace rollback automático en caso de error).
  const { data: companyId, error: rpcErr } = await admin.rpc(
    "create_company_and_admin",
    {
      p_user_id: userId,
      p_email: body.email,
      p_company_name: body.company_name,
      p_company_slug: slug,
      p_full_name: body.full_name,
    },
  );

  if (rpcErr || !companyId) {
    await admin.auth.admin.deleteUser(userId);
    // Mapear errores comunes a códigos tipados que el frontend ya entiende.
    const msg = rpcErr?.message?.toLowerCase() ?? "";
    let code: string;
    if (msg.includes("slug")) {
      code = "slug_collision";
    } else if (msg.includes("admin_users_pkey") || msg.includes("admin_users")) {
      code = "admin_insert_failed";
    } else {
      code = "company_insert_failed";
    }
    return new Response(
      JSON.stringify({ error: code, message: rpcErr?.message }),
      { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      user_id: userId,
      company_id: companyId,
    }),
    { status: 200, headers: { ...corsHeaders, "content-type": "application/json" } },
  );
}

// Solo arrancamos serve cuando este módulo es el entrypoint (no en tests).
// Envolvemos handler en un wrapper de 1-arg para satisfacer la signatura
// que espera Deno.serve (el handler tiene un segundo arg opcional para
// inyectar el cliente admin en tests).
if (import.meta.main) {
  Deno.serve((req) => handler(req));
}
