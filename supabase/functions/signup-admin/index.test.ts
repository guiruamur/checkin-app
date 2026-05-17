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

// Issue 2 del final review: ahora cubrimos la ruta de rollback inyectando
// un mock admin client. Verifica que cuando el RPC falla, llamamos a
// deleteUser y devolvemos error con código correcto.

function buildMockAdmin(opts: {
  createUserData: { user: { id: string } | null };
  createUserError: { message: string } | null;
  rpcResult: { data: string | null; error: { message: string } | null };
  deletedUserIds: string[];
}) {
  // El handler destructura { data, error } del resultado de createUser.
  // El mock devuelve esa misma shape (la real de supabase-js).
  return {
    auth: {
      admin: {
        createUser: (_args: unknown) =>
          Promise.resolve({ data: opts.createUserData, error: opts.createUserError }),
        deleteUser: (id: string) => {
          opts.deletedUserIds.push(id);
          return Promise.resolve({ data: { user: null }, error: null });
        },
      },
    },
    rpc: (_name: string, _args: unknown) => Promise.resolve(opts.rpcResult),
    // deno-lint-ignore no-explicit-any
  } as any;
}

Deno.test("rolls back auth.user when RPC fails", async () => {
  Deno.env.set("SUPABASE_URL", "http://stub");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "stub-key");

  const deletedUserIds: string[] = [];
  const mockAdmin = buildMockAdmin({
    createUserData: { user: { id: "user-rollback-test" } },
    createUserError: null,
    rpcResult: {
      data: null,
      error: { message: "duplicate key value violates unique constraint companies_slug_key" },
    },
    deletedUserIds,
  });

  const handler = (await import("./index.ts")).default;
  const req = new Request("http://localhost/signup-admin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "rollback@test.com",
      password: "password123",
      company_name: "Rollback Co",
      full_name: "Rollback Tester",
    }),
  });
  const res = await handler(req, mockAdmin);
  const body = await res.json();

  assertEquals(res.status, 500);
  assertEquals(body.error, "slug_collision");
  assertEquals(deletedUserIds, ["user-rollback-test"]);
});

Deno.test("happy path returns ok with user_id and company_id", async () => {
  Deno.env.set("SUPABASE_URL", "http://stub");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "stub-key");

  const deletedUserIds: string[] = [];
  const mockAdmin = buildMockAdmin({
    createUserData: { user: { id: "user-happy" } },
    createUserError: null,
    rpcResult: { data: "company-happy", error: null },
    deletedUserIds,
  });

  const handler = (await import("./index.ts")).default;
  const req = new Request("http://localhost/signup-admin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "happy@test.com",
      password: "password123",
      company_name: "Happy Co",
      full_name: "Happy Tester",
    }),
  });
  const res = await handler(req, mockAdmin);
  const body = await res.json();

  assertEquals(res.status, 200);
  assertEquals(body.ok, true);
  assertEquals(body.user_id, "user-happy");
  assertEquals(body.company_id, "company-happy");
  assertEquals(deletedUserIds.length, 0, "no rollback on happy path");
});

Deno.test("returns email_taken when createUser reports duplicate", async () => {
  Deno.env.set("SUPABASE_URL", "http://stub");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "stub-key");

  const deletedUserIds: string[] = [];
  const mockAdmin = buildMockAdmin({
    createUserData: { user: null },
    createUserError: { message: "User already registered" },
    rpcResult: { data: null, error: null },
    deletedUserIds,
  });

  const handler = (await import("./index.ts")).default;
  const req = new Request("http://localhost/signup-admin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "taken@test.com",
      password: "password123",
      company_name: "Taken Co",
      full_name: "Taken",
    }),
  });
  const res = await handler(req, mockAdmin);
  const body = await res.json();

  assertEquals(res.status, 400);
  assertEquals(body.error, "email_taken");
  assertEquals(deletedUserIds.length, 0, "no rollback when createUser itself fails");
});
