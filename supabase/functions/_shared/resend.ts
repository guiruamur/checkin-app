import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const DEFAULT_SENDER = "noreply@notify.ruanodev.com";

type SendEmailArgs = {
  companyId: string;
  to: string;
  subject: string;
  html: string;
};

type SendEmailResult = {
  id?: string;
  mocked?: boolean;
};

async function resolveSender(companyId: string, admin: SupabaseClient): Promise<string> {
  const { data } = await admin
    .from("companies")
    .select("email_sender_address, email_sender_verified_at")
    .eq("id", companyId)
    .single();

  if (data && data.email_sender_verified_at && data.email_sender_address) {
    return data.email_sender_address;
  }
  return DEFAULT_SENDER;
}

export async function sendEmail(
  args: SendEmailArgs,
  adminOverride?: SupabaseClient,
): Promise<SendEmailResult> {
  const admin = adminOverride ?? createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const from = await resolveSender(args.companyId, admin);
  const apiKey = Deno.env.get("RESEND_API_KEY");

  if (!apiKey) {
    console.log("[resend mock]", { from, to: args.to, subject: args.subject });
    return { mocked: true };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: args.to,
      subject: args.subject,
      html: args.html,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`resend_failed: ${res.status} ${errorText}`);
  }

  return await res.json() as SendEmailResult;
}

export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/{{(\w+)}}/g, (_, k) => vars[k] ?? "");
}
