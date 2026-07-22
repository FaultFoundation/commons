import { getCloudflareContext } from "@opennextjs/cloudflare";

const DEFAULT_SUPPORT_EMAIL = "support@fault.foundation";
const DEFAULT_HOST = "smtp.gmail.com";
// Implicit TLS. Workers block outbound port 25; 465 is open and skips the
// plaintext-then-STARTTLS upgrade. See lib/smtp.ts.
const DEFAULT_PORT = 465;

const SIGNATURE = ["— The Fault Foundation", "https://fault.foundation"];

/**
 * Sends one plain-text message over SMTP, straight from the Worker with no
 * third-party API in the path. We authenticate as SUPPORT_EMAIL (a Google
 * account) with SUPPORT_EMAIL_APP_PASSWORD, and send from that same address —
 * matching sender and account means Gmail has no reason to rewrite the From
 * header, so no "Send mail as" alias setup is needed.
 *
 * Without the app password (local dev/preview) the body is logged to the server
 * terminal instead, so every flow stays testable with zero setup. The SMTP
 * client is imported lazily so `next dev` — plain Node, no workerd sockets —
 * never loads it on that path.
 *
 * Callers below own the copy; this owns delivery. Never let it throw: every
 * caller is mid-flow and treats a false as "tell them it didn't send".
 */
async function sendMail({
  to,
  subject,
  text,
  /** Printed with the dev-fallback log line so it's obvious what failed to go. */
  devLabel,
}: {
  to: string;
  subject: string;
  text: string;
  devLabel: string;
}): Promise<{ ok: boolean }> {
  const { env } = getCloudflareContext();
  const supportEmail = env.SUPPORT_EMAIL ?? DEFAULT_SUPPORT_EMAIL;

  if (!env.SUPPORT_EMAIL_APP_PASSWORD) {
    // Only ever pretend to send outside production. Reporting success in a
    // real deployment would strand the member waiting on mail that was never
    // sent — for registration that means a permanent EMAIL_SENT status, and
    // for a two-factor challenge it means being locked out.
    if (process.env.NODE_ENV === "production") {
      console.error(
        "SUPPORT_EMAIL_APP_PASSWORD is not set — cannot send email.",
      );
      return { ok: false };
    }
    console.log(`[email:dev] ${devLabel} for ${to}:\n${text}`);
    return { ok: true };
  }

  try {
    const { sendSmtpMail } = await import("@/lib/smtp");
    await sendSmtpMail({
      host: env.SMTP_HOST ?? DEFAULT_HOST,
      port: Number(env.SMTP_PORT ?? DEFAULT_PORT),
      username: supportEmail,
      password: env.SUPPORT_EMAIL_APP_PASSWORD,
      from: env.EMAIL_FROM ?? `The Fault Foundation <${supportEmail}>`,
      to,
      subject,
      text,
    });
    return { ok: true };
  } catch (error) {
    console.error("SMTP send failed:", error);
    return { ok: false };
  }
}

/** Academic-email verification code (account setup step 1). */
export async function sendVerificationCodeEmail({
  to,
  code,
}: {
  to: string;
  code: string;
}): Promise<{ ok: boolean }> {
  return sendMail({
    to,
    devLabel: "verification code",
    subject: "Your Fault Foundation verification code",
    text: [
      "Hi,",
      "",
      `Your Fault Foundation verification code is: ${code}`,
      "",
      "Enter it on the account setup page to verify your academic email. The",
      "code expires in 24 hours.",
      "",
      "If you didn't request this, you can ignore this email.",
      "",
      ...SIGNATURE,
    ].join("\n"),
  });
}

/**
 * Confirms the address on the account itself — distinct from the academic
 * email above, which proves a school affiliation.
 *
 * Link-based rather than a code because Better Auth mints and consumes the
 * token itself (`/api/auth/verify-email`); there is no endpoint that would
 * accept a code we invented. The URL is built by Better Auth from
 * BETTER_AUTH_URL, so in local dev it points at :3999 even when you're
 * browsing `next dev` on :3000.
 */
export async function sendEmailVerificationLink({
  to,
  url,
}: {
  to: string;
  url: string;
}): Promise<{ ok: boolean }> {
  return sendMail({
    to,
    devLabel: "email verification link",
    subject: "Confirm your Fault Foundation email address",
    text: [
      "Hi,",
      "",
      "Confirm this address is yours by opening the link below:",
      "",
      url,
      "",
      "The link expires in an hour. If you didn't request this, you can ignore",
      "this email — nothing changes until the link is opened.",
      "",
      ...SIGNATURE,
    ].join("\n"),
  });
}

/**
 * Second-factor code, sent at sign-in and when enrolling in email 2FA.
 *
 * Deliberately terse and urgent: unlike the other two, receiving this without
 * having asked for it means someone else has the password.
 */
export async function sendTwoFactorCodeEmail({
  to,
  code,
}: {
  to: string;
  code: string;
}): Promise<{ ok: boolean }> {
  return sendMail({
    to,
    devLabel: "two-factor code",
    subject: "Your Fault Foundation sign-in code",
    text: [
      "Hi,",
      "",
      `Your sign-in code is: ${code}`,
      "",
      "It expires in 5 minutes and can only be used once.",
      "",
      "If you didn't just try to sign in, someone else knows your password —",
      "change it as soon as you can.",
      "",
      ...SIGNATURE,
    ].join("\n"),
  });
}
