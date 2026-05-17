import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// El handler hace import dinámico para que las env vars del módulo no se
// evalúen antes de que las seteemos en el test.

Deno.test("rejects non-POST methods", async () => {
  Deno.env.set("SUPABASE_URL", "http://stub");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "stub-key");

  const handler = (await import("./index.ts")).default;
  const req = new Request("http://localhost/signup-admin", { method: "GET" });
  const res = await handler(req);
  assertEquals(res.status, 405);
});

Deno.test("validates body schema - rejects missing email", async () => {
  Deno.env.set("SUPABASE_URL", "http://stub");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "stub-key");

  const handler = (await import("./index.ts")).default;
  const req = new Request("http://localhost/signup-admin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      password: "12345678",
      company_name: "X",
      full_name: "Y",
    }),
  });
  const res = await handler(req);
  const body = await res.json();
  assertEquals(res.status, 400);
  assertEquals(body.error, "validation");
});
