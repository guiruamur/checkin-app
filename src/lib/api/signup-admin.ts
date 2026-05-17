import { supabase } from "../supabase";
import { env } from "../env";

export type SignupAdminInput = {
  email: string;
  password: string;
  company_name: string;
  full_name: string;
};

export type SignupAdminError =
  | "validation"
  | "email_taken"
  | "slug_collision"
  | "auth_create_failed"
  | "company_insert_failed"
  | "admin_insert_failed"
  | "network"
  | "unknown";

export type SignupAdminResult =
  | { ok: true; user_id: string; company_id: string }
  | { ok: false; error: SignupAdminError; message?: string };

export async function callSignupAdmin(
  input: SignupAdminInput,
): Promise<SignupAdminResult> {
  let res: Response;
  try {
    res = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/signup-admin`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(input),
    });
  } catch (e) {
    return { ok: false, error: "network", message: String(e) };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, error: "unknown", message: `HTTP ${res.status} non-JSON` };
  }

  if (res.ok && (json as { ok?: boolean }).ok) {
    return json as SignupAdminResult;
  }

  const body = json as { error?: string; message?: string };
  const known: SignupAdminError[] = [
    "validation",
    "email_taken",
    "slug_collision",
    "auth_create_failed",
    "company_insert_failed",
    "admin_insert_failed",
  ];
  const error = (known as string[]).includes(body.error ?? "")
    ? (body.error as SignupAdminError)
    : "unknown";
  return { ok: false, error, message: body.message };
}

// Wrapper que tras la Edge Function hace signInWithPassword para obtener sesión.
export async function signupAdminAndLogin(
  input: SignupAdminInput,
): Promise<SignupAdminResult> {
  const result = await callSignupAdmin(input);
  if (!result.ok) return result;

  const { error } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });
  if (error) {
    return { ok: false, error: "unknown", message: `sign-in after signup: ${error.message}` };
  }
  return result;
}
