import { getCloudflareContext } from "@opennextjs/cloudflare";

const DEFAULT_SUPPORT_EMAIL = "support@fault.foundation";
const DEFAULT_HOST = "smtp.gmail.com";
// Implicit TLS. Workers block outbound port 25; 465 is open and skips the
// plaintext-then-STARTTLS upgrade. See lib/smtp.ts.
const DEFAULT_PORT = 465;

/**
 * Sends a verification code over SMTP, straight from the Worker with no
 * third-party API in the path. We authenticate as SUPPORT_EMAIL (a Google
 * account) with SUPPORT_EMAIL_APP_PASSWORD, and send from that same address —
 * matching sender and account means Gmail has no reason to rewrite the From
 * header, so no "Send mail as" alias setup is needed.
 *
 * Without the app password (local dev/preview) the code is logged to the
 * server terminal instead, so the flow stays testable with zero setup. The
 * SMTP client is imported lazily so `next dev` — plain Node, no workerd
 * sockets — never loads it on that path.
 */
export async function sendVerificationCodeEmail({
  to,
  code,
}: {
  to: string;
  code: string;
}): Promise<{ ok: boolean }> {
  const { env } = getCloudflareContext();
  const supportEmail = env.SUPPORT_EMAIL ?? DEFAULT_SUPPORT_EMAIL;

  if (!env.SUPPORT_EMAIL_APP_PASSWORD) {
    // Only ever pretend to send outside production. Reporting success in a
    // real deployment would mark the member EMAIL_SENT and park them on the
    // code page waiting for mail that was never sent.
    if (process.env.NODE_ENV === "production") {
      console.error(
        "SUPPORT_EMAIL_APP_PASSWORD is not set — cannot send verification codes.",
      );
      return { ok: false };
    }
    console.log(`[email:dev] verification code for ${to}: ${code}`);
    return { ok: true };
  }

  const text = [
    "Hi,",
    "",
    `Your Fault Foundation verification code is: ${code}`,
    "",
    "Enter it on the account setup page to verify your academic email. The",
    "code expires in 24 hours.",
    "",
    "If you didn't request this, you can ignore this email.",
    "",
    "— The Fault Foundation",
    "https://fault.foundation",
  ].join("\n");

  try {
    const { sendSmtpMail } = await import("@/lib/smtp");
    await sendSmtpMail({
      host: env.SMTP_HOST ?? DEFAULT_HOST,
      port: Number(env.SMTP_PORT ?? DEFAULT_PORT),
      username: supportEmail,
      password: env.SUPPORT_EMAIL_APP_PASSWORD,
      from: env.EMAIL_FROM ?? `The Fault Foundation <${supportEmail}>`,
      to,
      subject: "Your Fault Foundation verification code",
      text,
    });
    return { ok: true };
  } catch (error) {
    console.error("SMTP send failed:", error);
    return { ok: false };
  }
}
