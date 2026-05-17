import { create, verify } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

async function getKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("SUPABASE_JWT_SECRET");
  if (!secret) throw new Error("missing_jwt_secret");
  return await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signVerificationToken(
  payload: Record<string, unknown>,
  ttlSeconds: number,
): Promise<string> {
  const key = await getKey();
  const now = Math.floor(Date.now() / 1000);
  return await create(
    { alg: "HS256", typ: "JWT" },
    { ...payload, exp: now + ttlSeconds },
    key,
  );
}

export async function verifyVerificationToken<T>(token: string): Promise<T> {
  const key = await getKey();
  const payload = await verify(token, key);
  return payload as T;
}
