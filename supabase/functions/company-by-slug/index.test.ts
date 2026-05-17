import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.env.set("SUPABASE_URL", "http://stub");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "stub-key");

// Mock admin: returns company depending on slug
// deno-lint-ignore no-explicit-any
function buildAdmin(rows: Record<string, { name: string } | null>): any {
  return {
    from(_table: string) {
      return {
        select(_cols: string) {
          return {
            eq(_col: string, slug: string) {
              return {
                maybeSingle: () => Promise.resolve({
                  data: rows[slug] ?? null,
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

Deno.test("rejects non-GET", async () => {
  const req = new Request("http://localhost/company-by-slug", { method: "POST" });
  const res = await handler(req);
  assertEquals(res.status, 405);
});

Deno.test("400 when slug query param missing", async () => {
  const req = new Request("http://localhost/company-by-slug", { method: "GET" });
  const res = await handler(req, buildAdmin({}));
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "missing_slug");
});

Deno.test("200 with name when slug exists", async () => {
  const req = new Request("http://localhost/company-by-slug?slug=eventos-perez", { method: "GET" });
  const res = await handler(req, buildAdmin({ "eventos-perez": { name: "Eventos Pérez" } }));
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.name, "Eventos Pérez");
});

Deno.test("404 when slug not found", async () => {
  const req = new Request("http://localhost/company-by-slug?slug=ghost", { method: "GET" });
  const res = await handler(req, buildAdmin({}));
  assertEquals(res.status, 404);
  const body = await res.json();
  assertEquals(body.error, "not_found");
});
