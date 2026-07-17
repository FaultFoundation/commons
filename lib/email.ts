import { getCloudflareContext } from "@opennextjs/cloudflare";

const FALLBACK_FROM = "The Fault Foundation <no-reply@fault.foundation>";

/**
 * Sends a registration verification code via Resend. Without RESEND_API_KEY
 * (local dev/preview) the code is logged to the server terminal instead so
 * the flow stays testable with zero setup.
 */
export async function sendVerificationCodeEmail({
  to,
  code,
}: {
  to: string;
  code: string;
}): Promise<{ ok: boolean }> {
  const { env } = getCloudflareContext();

  if (!env.RESEND_API_KEY) {
    console.log(`[email:dev] verification code for ${to}: ${code}`);
    return { ok: true };
  }

  const text = [
    "Hi,",
    "",
    `Your Fault Foundation verification code is: ${code}`,
    "",
    "Enter it on the registration page to verify your school email. The",
    "code expires in 24 hours.",
    "",
    "If you didn't request this, you can ignore this email.",
    "",
    "— The Fault Foundation",
    "https://fault.foundation",
  ].join("\n");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM ?? FALLBACK_FROM,
      to: [to],
      subject: "Your Fault Foundation verification code",
      text,
    }),
  });

  if (!res.ok) {
    console.error(
      `Resend send failed (${res.status}): ${await res.text().catch(() => "")}`,
    );
    return { ok: false };
  }
  return { ok: true };
}
