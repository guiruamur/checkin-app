import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.env.set("SUPABASE_URL", "http://stub");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "stub-key");
Deno.env.set("SUPABASE_JWT_SECRET", "test-secret-at-least-32-chars-long-aaaaaa");

const { signVerificationToken } = await import("../_shared/jwt.ts");

// Mock admin tracks inserts and worker lookups
type FakeAdminState = {
  workerExistsFor?: string;  // company_id where worker exists
  inserted: Array<Record<string, unknown>>;
  insertError?: { code: string; message: string };  // forzar error en el INSERT
};

// deno-lint-ignore no-explicit-any
function buildAdmin(state: FakeAdminState): any {
  return {
    from(table: string) {
      return {
        select(_cols: string) {
          return {
            eq(col: string, val: string) {
              if (table === "companies" && col === "id") {
                return {
                  single: () => Promise.resolve({
                    data: { name: "Test Co" },
                    error: null,
                  }),
                };
              }
              return {
                eq(_col2: string, _val2: string) {
                  return {
                    is(_col3: string, _val3: null) {
                      return {
                        maybeSingle: () => Promise.resolve({
                          data: state.workerExistsFor && state.workerExistsFor === val
                            ? { id: "existing-worker" }
                            : null,
                          error: null,
                        }),
                      };
                    },
                  };
                },
              };
            },
          };
        },
        insert(row: Record<string, unknown>) {
          if (state.insertError) {
            return Promise.resolve({ data: null, error: state.insertError });
          }
          state.inserted.push(row);
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  };
}

const { default: handler } = await import("./index.ts");

const VALID_FORM_DATA = {
  first_name: "Ana",
  last_name: "López",
  email: "ana@x.com",
  phone: "600000123",
  languages: ["español"],
};

Deno.test("400 invalid_token when JWT signature is bad", async () => {
  const req = new Request("http://localhost/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: "not-a-real-jwt" }),
  });
  const res = await handler(req, buildAdmin({ inserted: [] }));
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "invalid_token");
});

Deno.test("400 token_expired when JWT expired", async () => {
  const token = await signVerificationToken(
    { form_data: VALID_FORM_DATA, company_id: "co-123" },
    -10,  // already expired
  );
  const req = new Request("http://localhost/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
  const res = await handler(req, buildAdmin({ inserted: [] }));
  assertEquals(res.status, 400);
  const body = await res.json();
  // Distinguir expired vs invalid es opcional; aquí ambos caen en invalid_token
  // si djwt no diferencia. Aceptamos invalid_token o token_expired.
  assertEquals(["invalid_token", "token_expired"].includes(body.error), true);
});

Deno.test("200 and inserts worker when token valid and worker does not exist", async () => {
  const state: FakeAdminState = { inserted: [] };
  const token = await signVerificationToken(
    { form_data: VALID_FORM_DATA, company_id: "co-123" },
    300,
  );
  const req = new Request("http://localhost/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
  const res = await handler(req, buildAdmin(state));
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.company_name, "Test Co");
  assertEquals(state.inserted.length, 1);
  assertEquals(state.inserted[0].email, "ana@x.com");
  assertEquals(state.inserted[0].company_id, "co-123");
});

Deno.test("200 idempotent when worker already exists (no insert)", async () => {
  const state: FakeAdminState = { workerExistsFor: "co-123", inserted: [] };
  const token = await signVerificationToken(
    { form_data: VALID_FORM_DATA, company_id: "co-123" },
    300,
  );
  const req = new Request("http://localhost/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
  const res = await handler(req, buildAdmin(state));
  assertEquals(res.status, 200);
  assertEquals(state.inserted.length, 0, "should not insert when worker already exists");
});

Deno.test("200 idempotent when INSERT hits unique_violation race (23505)", async () => {
  const state: FakeAdminState = {
    inserted: [],
    insertError: { code: "23505", message: "duplicate key value violates unique constraint workers_company_email_unique" },
  };
  const token = await signVerificationToken(
    { form_data: VALID_FORM_DATA, company_id: "co-123" },
    300,
  );
  const req = new Request("http://localhost/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
  const res = await handler(req, buildAdmin(state));
  assertEquals(res.status, 200, "unique_violation race condition is silently treated as success");
  const body = await res.json();
  assertEquals(body.company_name, "Test Co");
});

Deno.test("500 when INSERT fails with non-race error", async () => {
  const state: FakeAdminState = {
    inserted: [],
    insertError: { code: "23502", message: "null value in column violates not-null constraint" },
  };
  const token = await signVerificationToken(
    { form_data: VALID_FORM_DATA, company_id: "co-123" },
    300,
  );
  const req = new Request("http://localhost/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
  const res = await handler(req, buildAdmin(state));
  assertEquals(res.status, 500, "non-race insert errors surface as 500");
  const body = await res.json();
  assertEquals(body.error, "registration_failed");
});
