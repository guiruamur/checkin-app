import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.env.set("SUPABASE_URL", "http://stub");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "stub-key");
Deno.env.set("SUPABASE_JWT_SECRET", "test-secret-at-least-32-chars-long-aaaaaa");
Deno.env.set("SITE_URL", "http://localhost:5173");

// Stub admin con company lookup
// deno-lint-ignore no-explicit-any
function buildAdmin(companyBySlug: Record<string, { id: string; name: string } | null>, opts?: { senderRow?: { email_sender_address: string | null; email_sender_verified_at: string | null } }): any {
  return {
    from(table: string) {
      return {
        select(_cols: string) {
          return {
            eq(_col: string, val: string) {
              return {
                maybeSingle: () => Promise.resolve({
                  data: table === "companies" ? companyBySlug[val] ?? null : null,
                  error: null,
                }),
                single: () => Promise.resolve({
                  data: opts?.senderRow ?? { email_sender_address: null, email_sender_verified_at: null },
                  error: null,
                }),
              };
            },
          };
        },
      };
    },
  };
}

const { default: handler } = await import("./index.ts");

const VALID_BODY = {
  company_slug: "eventos-perez",
  first_name: "Ana",
  last_name: "López",
  email: "ana@x.com",
  phone: "600000123",
  languages: ["español"],
  website: "",
};

Deno.test("rejects non-POST", async () => {
  const req = new Request("http://localhost/x", { method: "GET" });
  const res = await handler(req);
  assertEquals(res.status, 405);
});

Deno.test("400 validation when phone invalid", async () => {
  const req = new Request("http://localhost/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...VALID_BODY, phone: "abc" }),
  });
  const res = await handler(req, buildAdmin({}));
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "validation");
});

Deno.test("404 when company slug does not exist", async () => {
  const req = new Request("http://localhost/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(VALID_BODY),
  });
  const res = await handler(req, buildAdmin({}));  // no companies known
  assertEquals(res.status, 404);
  const body = await res.json();
  assertEquals(body.error, "company_not_found");
});

Deno.test("200 silent when honeypot website is filled (bot detected, no info leak)", async () => {
  // Issue 4 fix: el spec dice 200 sin body, NO 400. Devolver 400 le diría al
  // bot que detectamos su intento; 200 silencioso le hace creer que tuvo
  // éxito y se va sin volver a intentar variaciones.
  const req = new Request("http://localhost/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...VALID_BODY, website: "https://spambot.example" }),
  });
  // buildAdmin({}) sin slugs: si el handler intentara buscar la company,
  // devolvería 404. Que devuelva 200 confirma que salió antes (honeypot).
  const res = await handler(req, buildAdmin({}));
  assertEquals(res.status, 200, "honeypot bot gets 200 with no body — no DB lookup, no email sent");
});

Deno.test("200 when valid body and company found (email mocked, no RESEND_API_KEY)", async () => {
  Deno.env.delete("RESEND_API_KEY");
  const req = new Request("http://localhost/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(VALID_BODY),
  });
  const res = await handler(
    req,
    buildAdmin({ "eventos-perez": { id: "co-123", name: "Eventos Pérez" } }),
  );
  assertEquals(res.status, 200);
});
