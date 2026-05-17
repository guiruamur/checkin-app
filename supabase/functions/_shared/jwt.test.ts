import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";

// Set a deterministic secret for tests BEFORE importing the helper
Deno.env.set("SUPABASE_JWT_SECRET", "test-secret-at-least-32-chars-long-aaaaaa");

const { signVerificationToken, verifyVerificationToken } = await import("./jwt.ts");

Deno.test("sign+verify roundtrip preserves payload", async () => {
  const payload = { foo: "bar", num: 42 };
  const token = await signVerificationToken(payload, 60);
  const verified = await verifyVerificationToken<typeof payload & { exp: number }>(token);
  assertEquals(verified.foo, "bar");
  assertEquals(verified.num, 42);
  // exp should be ~now + 60
  const now = Math.floor(Date.now() / 1000);
  assertEquals(verified.exp > now, true);
  assertEquals(verified.exp <= now + 61, true);
});

Deno.test("verify rejects expired token", async () => {
  // Sign with -10s ttl (already expired)
  const token = await signVerificationToken({ foo: "bar" }, -10);
  await assertRejects(
    async () => await verifyVerificationToken(token),
    Error,
  );
});

Deno.test("verify rejects token with wrong signature", async () => {
  const token = await signVerificationToken({ foo: "bar" }, 60);
  // Tamper with the signature (last segment)
  const parts = token.split(".");
  parts[2] = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const tampered = parts.join(".");
  await assertRejects(
    async () => await verifyVerificationToken(tampered),
    Error,
  );
});
