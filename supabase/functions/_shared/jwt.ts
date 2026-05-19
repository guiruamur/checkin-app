import { create, verify } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

async function getKey(): Promise<CryptoKey> {
  // WORKER_TOKEN_SECRET firma/verifica los JWT del flujo de inscripción
  // del candidato. Es independiente del JWT de Supabase Auth.
  // El namespace SUPABASE_* está reservado por Supabase y bloquea custom
  // secrets, así que no podemos reutilizar SUPABASE_JWT_SECRET.
  const secret = Deno.env.get("WORKER_TOKEN_SECRET");
  if (!secret) throw new Error("missing_worker_token_secret");
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
