import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";

export default async function handler(
  req: Request,
  adminOverride?: SupabaseClient,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "method_not_allowed" }),
      { status: 405, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }

  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");

  if (!slug) {
    return new Response(
      JSON.stringify({ error: "missing_slug" }),
      { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }

  const admin = adminOverride ?? createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data } = await admin
    .from("companies")
    .select("name")
    .eq("slug", slug)
    .maybeSingle();

  if (!data) {
    return new Response(
      JSON.stringify({ error: "not_found" }),
      { status: 404, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({ name: data.name }),
    { status: 200, headers: { ...corsHeaders, "content-type": "application/json" } },
  );
}

if (import.meta.main) {
  Deno.serve((req) => handler(req));
}
