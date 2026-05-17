import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
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

export default async function handler(req: Request): Promise<Response> {
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

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

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

  // 3. Crear company + admin_user atómicamente. Si falla, borrar el auth.user.
  const { data: companyRow, error: companyErr } = await admin
    .from("companies")
    .insert({ name: body.company_name, slug })
    .select("id")
    .single();

  if (companyErr || !companyRow) {
    await admin.auth.admin.deleteUser(userId);
    const code = companyErr?.message?.toLowerCase().includes("slug")
      ? "slug_collision"
      : "company_insert_failed";
    return new Response(
      JSON.stringify({ error: code, message: companyErr?.message }),
      { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }

  const { error: adminErr } = await admin.from("admin_users").insert({
    id: userId,
    company_id: companyRow.id,
    email: body.email,
    full_name: body.full_name,
  });

  if (adminErr) {
    // Rollback: borrar la company creada + auth.user.
    await admin.from("companies").delete().eq("id", companyRow.id);
    await admin.auth.admin.deleteUser(userId);
    return new Response(
      JSON.stringify({ error: "admin_insert_failed", message: adminErr.message }),
      { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      user_id: userId,
      company_id: companyRow.id,
    }),
    { status: 200, headers: { ...corsHeaders, "content-type": "application/json" } },
  );
}

// Solo arrancamos serve cuando este módulo es el entrypoint (no en tests).
if (import.meta.main) {
  Deno.serve(handler);
}
