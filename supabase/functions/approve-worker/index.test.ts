import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.env.set("SUPABASE_URL", "http://stub");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "stub-key");

// Construye un JWT decodificable con el company_id deseado.
// La firma es bogus pero el handler no la verifica (Supabase lo hizo).
function makeAdminJwt(companyId: string): string {
  const b64url = (obj: object) =>
    btoa(JSON.stringify(obj))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const header = b64url({ alg: "HS256", typ: "JWT" });
  const payload = b64url({ sub: "admin-1", company_id: companyId });
  return `${header}.${payload}.bogus-signature`;
}

type FakeAdminState = {
  worker?: { id: string; email: string; first_name: string; status: string; company_id: string };
  tenantFilterUsed?: string;  // captura el company_id por el que se filtró
  updated: boolean;
  lastUpdate?: Record<string, unknown>;  // captura el changeset del UPDATE
  sendEmailThrows?: boolean;  // fuerza fetch a Resend a fallar
};

// deno-lint-ignore no-explicit-any
function buildAdmin(state: FakeAdminState): any {
  return {
    from(table: string) {
      const queryChain = {
        _filters: {} as Record<string, string>,
        select(_cols: string) {
          return this;
        },
        eq(col: string, val: string) {
          this._filters[col] = val;
          if (col === "company_id") state.tenantFilterUsed = val;
          return this;
        },
        maybeSingle() {
          if (table === "workers") {
            // Solo devolver el worker si los filtros coinciden con su tenant
            if (state.worker
                && this._filters.id === state.worker.id
                && (!this._filters.company_id || this._filters.company_id === state.worker.company_id)) {
              return Promise.resolve({ data: state.worker, error: null });
            }
            return Promise.resolve({ data: null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        single() {
          if (table === "companies") {
            return Promise.resolve({
              data: { name: "Test Co", email_sender_address: null, email_sender_verified_at: null },
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        },
      };
      return {
        select: queryChain.select.bind(queryChain),
        update(changes: Record<string, unknown>) {
          state.updated = true;
          state.lastUpdate = changes;
          return {
            eq(_col: string, _val: string) {
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
      };
    },
  };
}

const { default: handler } = await import("./index.ts");

const ADMIN_CO_A = makeAdminJwt("co-a");
const ADMIN_CO_B = makeAdminJwt("co-b");

Deno.test("401 when Authorization header missing", async () => {
  const req = new Request("http://localhost/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ worker_id: "11111111-1111-1111-1111-111111111111" }),
  });
  const res = await handler(req, buildAdmin({ updated: false }));
  assertEquals(res.status, 401);
});

Deno.test("400 validation when worker_id missing", async () => {
  const req = new Request("http://localhost/x", {
    method: "POST",
    headers: { "content-type": "application/json", "authorization": `Bearer ${ADMIN_CO_A}` },
    body: JSON.stringify({}),
  });
  const res = await handler(req, buildAdmin({ updated: false }));
  assertEquals(res.status, 400);
});

Deno.test("403 when worker belongs to a different tenant (cross-tenant attack blocked)", async () => {
  const state: FakeAdminState = {
    worker: { id: "11111111-1111-1111-1111-111111111111", email: "w@x.com", first_name: "W", status: "pending", company_id: "co-b" },
    updated: false,
  };
  const req = new Request("http://localhost/x", {
    method: "POST",
    headers: { "content-type": "application/json", "authorization": `Bearer ${ADMIN_CO_A}` },
    body: JSON.stringify({ worker_id: "11111111-1111-1111-1111-111111111111" }),
  });
  const res = await handler(req, buildAdmin(state));
  assertEquals(res.status, 403);
  assertEquals(state.tenantFilterUsed, "co-a", "must filter SELECT by admin's company_id");
  assertEquals(state.updated, false, "must not UPDATE when forbidden");
});

Deno.test("409 not_pending when worker status is already approved", async () => {
  const state: FakeAdminState = {
    worker: { id: "11111111-1111-1111-1111-111111111111", email: "w@x.com", first_name: "W", status: "approved", company_id: "co-a" },
    updated: false,
  };
  const req = new Request("http://localhost/x", {
    method: "POST",
    headers: { "content-type": "application/json", "authorization": `Bearer ${ADMIN_CO_A}` },
    body: JSON.stringify({ worker_id: "11111111-1111-1111-1111-111111111111" }),
  });
  const res = await handler(req, buildAdmin(state));
  assertEquals(res.status, 409);
  const body = await res.json();
  assertEquals(body.error, "not_pending");
});

Deno.test("200 ok when pending worker approved (email mocked sin RESEND_API_KEY)", async () => {
  Deno.env.delete("RESEND_API_KEY");
  const state: FakeAdminState = {
    worker: { id: "11111111-1111-1111-1111-111111111111", email: "w@x.com", first_name: "W", status: "pending", company_id: "co-a" },
    updated: false,
  };
  const req = new Request("http://localhost/x", {
    method: "POST",
    headers: { "content-type": "application/json", "authorization": `Bearer ${ADMIN_CO_A}` },
    body: JSON.stringify({ worker_id: "11111111-1111-1111-1111-111111111111" }),
  });
  const res = await handler(req, buildAdmin(state));
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.ok, true);
  assertEquals(state.updated, true, "UPDATE called");
  // Issue 3: approved_by debe ser el sub del JWT (admin-1, ver makeAdminJwt)
  assertEquals(state.lastUpdate?.approved_by, "admin-1", "approved_by populated from JWT sub");
  assertEquals(state.lastUpdate?.status, "approved");
});

Deno.test("200 ok with email_warning when sendEmail throws", async () => {
  // Issue 6 fix: cubrir el path donde UPDATE OK pero el envío de email falla.
  // El handler debe devolver 200 (la aprobación está hecha) con email_warning=true.
  Deno.env.set("RESEND_API_KEY", "re_fake_test_key");

  const state: FakeAdminState = {
    worker: { id: "11111111-1111-1111-1111-111111111111", email: "w@x.com", first_name: "W", status: "pending", company_id: "co-a" },
    updated: false,
  };

  // Stub fetch para que api.resend.com falle con 503
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => Promise.resolve(
    new Response(JSON.stringify({ message: "Resend down" }), { status: 503 })
  )) as typeof fetch;

  try {
    const req = new Request("http://localhost/x", {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": `Bearer ${ADMIN_CO_A}` },
      body: JSON.stringify({ worker_id: "11111111-1111-1111-1111-111111111111" }),
    });
    const res = await handler(req, buildAdmin(state));
    assertEquals(res.status, 200, "approval succeeds even if email send fails");
    const body = await res.json();
    assertEquals(body.ok, true);
    assertEquals(body.email_warning, true, "email_warning flag set when Resend fails");
    assertEquals(state.updated, true, "UPDATE applied (approval is the primary side effect)");
  } finally {
    globalThis.fetch = originalFetch;
    Deno.env.delete("RESEND_API_KEY");
  }
});
