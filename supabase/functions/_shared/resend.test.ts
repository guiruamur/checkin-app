import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

// Stub admin client para los tests
function buildMockAdmin(companyRow: { email_sender_address: string | null; email_sender_verified_at: string | null }) {
  return {
    from(_table: string) {
      return {
        select(_cols: string) {
          return {
            eq(_col: string, _val: string) {
              return {
                single: () => Promise.resolve({ data: companyRow, error: null }),
              };
            },
          };
        },
      };
    },
    // deno-lint-ignore no-explicit-any
  } as any;
}

const { sendEmail, renderTemplate } = await import("./resend.ts");

Deno.test("renderTemplate replaces {{vars}} with values", () => {
  const out = renderTemplate("Hola {{name}}, eres de {{company}}.", {
    name: "Ana",
    company: "Eventos Pérez",
  });
  assertEquals(out, "Hola Ana, eres de Eventos Pérez.");
});

Deno.test("renderTemplate leaves unknown vars empty", () => {
  const out = renderTemplate("Hola {{name}}, {{unknown}}.", { name: "Ana" });
  assertEquals(out, "Hola Ana, .");
});

Deno.test("sendEmail mocks to console.log when RESEND_API_KEY missing", async () => {
  Deno.env.delete("RESEND_API_KEY");
  const admin = buildMockAdmin({ email_sender_address: null, email_sender_verified_at: null });
  const result = await sendEmail(
    { companyId: "test", to: "to@x.com", subject: "S", html: "<p>H</p>" },
    admin,
  );
  assertEquals(result.mocked, true);
});

Deno.test("sendEmail uses tenant sender when verified", async () => {
  Deno.env.set("RESEND_API_KEY", "re_fake_test_key");

  const admin = buildMockAdmin({
    email_sender_address: "noreply@cliente.com",
    email_sender_verified_at: new Date().toISOString(),
  });

  // Mock fetch to capture the request
  let capturedBody: string | null = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((_url: string, opts: { body?: string }) => {
    capturedBody = opts.body ?? null;
    return Promise.resolve(
      new Response(JSON.stringify({ id: "test-email-id" }), { status: 200 }),
    );
  }) as typeof fetch;

  try {
    await sendEmail(
      { companyId: "test", to: "to@x.com", subject: "S", html: "<p>H</p>" },
      admin,
    );
    assertStringIncludes(capturedBody!, '"from":"noreply@cliente.com"');
  } finally {
    globalThis.fetch = originalFetch;
    Deno.env.delete("RESEND_API_KEY");
  }
});

Deno.test("sendEmail falls back to shared sender when tenant not verified", async () => {
  Deno.env.set("RESEND_API_KEY", "re_fake_test_key");

  const admin = buildMockAdmin({
    email_sender_address: "noreply@cliente.com",
    email_sender_verified_at: null,  // not verified yet
  });

  let capturedBody: string | null = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((_url: string, opts: { body?: string }) => {
    capturedBody = opts.body ?? null;
    return Promise.resolve(
      new Response(JSON.stringify({ id: "test-email-id" }), { status: 200 }),
    );
  }) as typeof fetch;

  try {
    await sendEmail(
      { companyId: "test", to: "to@x.com", subject: "S", html: "<p>H</p>" },
      admin,
    );
    assertStringIncludes(capturedBody!, '"from":"noreply@notify.ruanodev.com"');
  } finally {
    globalThis.fetch = originalFetch;
    Deno.env.delete("RESEND_API_KEY");
  }
});
