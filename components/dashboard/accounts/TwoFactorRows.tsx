"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import { QrCode } from "./QrCode";
import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";
import { ConfirmDialog } from "@/components/dashboard/bubbles/ConfirmDialog";
import { authClient } from "@/lib/auth-client";
import { manualEntryKey, twoFactorError } from "@/lib/two-factor";

/**
 * Two-factor authentication, as the Security bubble's rows.
 *
 * Better Auth models this as one switch with two ways to satisfy it, not two
 * independent toggles, and the UI follows that shape rather than fighting it.
 * Turning 2FA on always mints a TOTP secret; whether an authenticator app is
 * actually *offered* at sign-in depends on whether the member ever proved they
 * could read a code from one. Someone who enrolls by email leaves that secret
 * unproven, so their challenge offers email only — which is why "Add
 * authenticator app" exists as a separate step below rather than as a checkbox.
 *
 * Email codes need no per-member setup at all: they're available to anyone with
 * 2FA on, because the server has a sender configured (see lib/auth.ts).
 */
export function TwoFactorRows({
  enabled,
  hasTotp,
  hasPassword,
  email,
}: {
  enabled: boolean;
  /** A TOTP secret this member has verified — i.e. an app is really set up. */
  hasTotp: boolean;
  /** No credential account = no password to confirm with, and nothing to
      protect: Discord sign-in doesn't pass through the 2FA challenge. */
  hasPassword: boolean;
  email: string;
}) {
  if (!hasPassword) {
    return (
      <BubbleRow
        label="Two-factor authentication"
        value="Unavailable"
        note="Set a password above first. Two-factor codes apply to email and password sign-in; signing in with Discord is governed by Discord's own security settings."
      />
    );
  }

  return enabled ? (
    <TwoFactorOn hasTotp={hasTotp} />
  ) : (
    <TwoFactorOff email={email} />
  );
}

// ---------------------------------------------------------------------------
// Off → enrollment
// ---------------------------------------------------------------------------

/**
 * The enrollment flow, as an explicit step machine rather than a pile of
 * booleans: password → pick a method → prove it → keep these backup codes.
 *
 * `enable` hands back the TOTP URI *and* the backup codes up front, before
 * either has been proven, so both ride along in the step until the member has
 * actually finished. Nothing is switched on server-side until the verify call
 * lands, so abandoning this halfway leaves 2FA off — which is the behaviour we
 * want: no way to end up locked out by a half-finished setup.
 */
type Step =
  | { name: "idle" }
  | { name: "password" }
  | { name: "method"; totpURI: string; backupCodes: string[] }
  | { name: "totp"; totpURI: string; backupCodes: string[] }
  | { name: "otp"; backupCodes: string[] }
  | { name: "codes"; backupCodes: string[] };

function TwoFactorOff({ email }: { email: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ name: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function fail(message: string) {
    setPending(false);
    setError(message);
  }

  async function onPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    setPending(true);
    const password = String(
      new FormData(event.currentTarget).get("password") ?? "",
    );
    const result = await authClient.twoFactor.enable({ password });
    if (result.error || !result.data) {
      fail(twoFactorError(result.error ?? {}));
      return;
    }
    setPending(false);
    setStep({
      name: "method",
      totpURI: result.data.totpURI,
      backupCodes: result.data.backupCodes,
    });
  }

  async function chooseEmail(backupCodes: string[]) {
    if (pending) return;
    setError(null);
    setPending(true);
    const result = await authClient.twoFactor.sendOtp();
    if (result.error) {
      fail(twoFactorError(result.error));
      return;
    }
    setPending(false);
    setStep({ name: "otp", backupCodes });
  }

  async function verify(
    event: FormEvent<HTMLFormElement>,
    kind: "totp" | "otp",
    backupCodes: string[],
  ) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    setPending(true);
    const code = String(new FormData(event.currentTarget).get("code") ?? "").trim();
    const result =
      kind === "totp"
        ? await authClient.twoFactor.verifyTotp({ code })
        : await authClient.twoFactor.verifyOtp({ code });
    if (result.error) {
      fail(twoFactorError(result.error));
      return;
    }
    setPending(false);
    setStep({ name: "codes", backupCodes });
  }

  function finish() {
    setStep({ name: "idle" });
    router.refresh();
  }

  return (
    <>
      <BubbleRow
        label="Two-factor authentication"
        value="Off"
        note="Ask for a second code when signing in with your email and password."
        action={
          <button
            className="ff-btn ff-btn--outline ff-btn--sm"
            type="button"
            onClick={() => {
              setError(null);
              setStep({ name: "password" });
            }}
          >
            Turn On
          </button>
        }
      />
      <TwoFactorDialog
        open={step.name !== "idle"}
        busy={pending}
        title="Set up two-factor authentication"
        onClose={() => {
          if (!pending) setStep({ name: "idle" });
        }}
      >
        <div className="ff-2fa">
          {error ? (
            <div className="ff-auth__error" role="alert">
              <p>{error}</p>
            </div>
          ) : null}

          {step.name === "password" ? (
            <form onSubmit={onPassword}>
              <p className="ff-2fa__lede">
                Confirm your password to start setting up two-factor
                authentication.
              </p>
              <label className="ff-auth__field">
                <span className="ff-auth__label">Password</span>
                <input
                  className="ff-auth__input"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </label>
              <Buttons
                pending={pending}
                submitLabel="Continue"
                onCancel={() => setStep({ name: "idle" })}
              />
            </form>
          ) : null}

          {step.name === "method" ? (
            <>
              <p className="ff-2fa__lede">
                How would you like to receive your second code?
              </p>
              <div className="ff-row__buttons">
                <button
                  className="ff-btn ff-btn--outline ff-btn--sm"
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    setStep({
                      name: "totp",
                      totpURI: step.totpURI,
                      backupCodes: step.backupCodes,
                    })
                  }
                >
                  Authenticator app
                </button>
                <button
                  className="ff-btn ff-btn--outline ff-btn--sm"
                  type="button"
                  disabled={pending}
                  onClick={() => chooseEmail(step.backupCodes)}
                >
                  {pending ? "Sending…" : "Email a code"}
                </button>
              </div>
              <p className="ff-2fa__hint">
                An authenticator app keeps working if you lose access to your
                inbox. You can add one later either way.
              </p>
            </>
          ) : null}

          {step.name === "totp" ? (
            <TotpSetup
              totpURI={step.totpURI}
              pending={pending}
              onSubmit={(event) => verify(event, "totp", step.backupCodes)}
              onCancel={() => setStep({ name: "idle" })}
            />
          ) : null}

          {step.name === "otp" ? (
            <form onSubmit={(event) => verify(event, "otp", step.backupCodes)}>
              <p className="ff-2fa__lede">
                We sent a code to <strong>{email}</strong>. It expires in five
                minutes.
              </p>
              <CodeField label="Email code" />
              <Buttons
                pending={pending}
                submitLabel="Turn On"
                onCancel={() => setStep({ name: "idle" })}
              />
            </form>
          ) : null}

          {step.name === "codes" ? (
            <BackupCodes codes={step.backupCodes} onDone={finish} />
          ) : null}
        </div>
      </TwoFactorDialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// On → manage
// ---------------------------------------------------------------------------

function TwoFactorOn({ hasTotp }: { hasTotp: boolean }) {
  return (
    <>
      <BubbleRow
        label="Two-factor authentication"
        value={hasTotp ? "Authenticator app and email" : "Email codes"}
        note="Applies when signing in with your email and password. Signing in with Discord is governed by Discord's own security settings."
        action={<DisableButton />}
      />
      {hasTotp ? null : <AddAuthenticatorRow />}
      <RegenerateBackupCodesRow />
    </>
  );
}

/** Adds an app to an account that enrolled by email. */
function AddAuthenticatorRow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ name: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    setPending(true);
    const password = String(
      new FormData(event.currentTarget).get("password") ?? "",
    );
    const result = await authClient.twoFactor.enable({ password });
    setPending(false);
    if (result.error || !result.data) {
      setError(twoFactorError(result.error ?? {}));
      return;
    }
    setStep({
      name: "totp",
      totpURI: result.data.totpURI,
      backupCodes: result.data.backupCodes,
    });
  }

  async function onVerify(event: FormEvent<HTMLFormElement>, codes: string[]) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    setPending(true);
    const code = String(new FormData(event.currentTarget).get("code") ?? "").trim();
    const result = await authClient.twoFactor.verifyTotp({ code });
    setPending(false);
    if (result.error) {
      setError(twoFactorError(result.error));
      return;
    }
    setStep({ name: "codes", backupCodes: codes });
  }

  return (
    <>
      <BubbleRow
        label="Authenticator app"
        value="Not set up"
        note="Adding one issues a fresh set of backup codes — the ones you have now stop working."
        action={
          <button
            className="ff-btn ff-btn--outline ff-btn--sm"
            type="button"
            onClick={() => {
              setError(null);
              setStep({ name: "password" });
            }}
          >
            Add
          </button>
        }
      />
      <TwoFactorDialog
        open={step.name !== "idle"}
        busy={pending}
        title="Add authenticator app"
        onClose={() => {
          if (!pending) setStep({ name: "idle" });
        }}
      >
        <div className="ff-2fa">
          {error ? (
            <div className="ff-auth__error" role="alert">
              <p>{error}</p>
            </div>
          ) : null}

          {step.name === "password" ? (
            <form onSubmit={onPassword}>
              <label className="ff-auth__field">
                <span className="ff-auth__label">Password</span>
                <input
                  className="ff-auth__input"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </label>
              <Buttons
                pending={pending}
                submitLabel="Continue"
                onCancel={() => setStep({ name: "idle" })}
              />
            </form>
          ) : null}

          {step.name === "totp" ? (
            <TotpSetup
              totpURI={step.totpURI}
              pending={pending}
              onSubmit={(event) => onVerify(event, step.backupCodes)}
              onCancel={() => setStep({ name: "idle" })}
            />
          ) : null}

          {step.name === "codes" ? (
            <BackupCodes
              codes={step.backupCodes}
              onDone={() => {
                setStep({ name: "idle" });
                router.refresh();
              }}
            />
          ) : null}
        </div>
      </TwoFactorDialog>
    </>
  );
}

function RegenerateBackupCodesRow() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);

  async function onConfirm() {
    if (pending) return;
    setError(null);
    setPending(true);
    const result = await authClient.twoFactor.generateBackupCodes({ password });
    setPending(false);
    if (result.error || !result.data) {
      setError(twoFactorError(result.error ?? {}));
      return;
    }
    setCodes(result.data.backupCodes);
    setPassword("");
    setOpen(false);
  }

  return (
    <BubbleRow
      label="Backup codes"
      value="One-time codes for when you can't get a code"
      note="Each works once. Generating a new set immediately retires the old one."
      action={
        <button
          className="ff-btn ff-btn--outline ff-btn--sm"
          type="button"
          onClick={() => {
            setError(null);
            setCodes(null);
            setOpen(true);
          }}
        >
          Regenerate
        </button>
      }
    >
      {codes ? (
        <div className="ff-2fa">
          <BackupCodes codes={codes} onDone={() => setCodes(null)} />
        </div>
      ) : undefined}

      <ConfirmDialog
        open={open}
        title="Regenerate Backup Codes"
        description="Your current backup codes stop working straight away. Make sure you can save the new ones before continuing."
        confirmLabel={pending ? "Generating…" : "Regenerate"}
        busy={pending}
        error={error}
        onConfirm={onConfirm}
        onClose={() => {
          if (pending) return;
          setOpen(false);
          setPassword("");
          setError(null);
        }}
      >
        <label className="ff-auth__field">
          <span className="ff-auth__label">Password</span>
          <input
            className="ff-auth__input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
      </ConfirmDialog>
    </BubbleRow>
  );
}

function DisableButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    if (pending) return;
    setError(null);
    setPending(true);
    const result = await authClient.twoFactor.disable({ password });
    setPending(false);
    if (result.error) {
      setError(twoFactorError(result.error));
      return;
    }
    setOpen(false);
    setPassword("");
    router.refresh();
  }

  return (
    <>
      <button
        className="ff-btn ff-btn--outline ff-btn--sm"
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        Turn Off
      </button>
      <ConfirmDialog
        open={open}
        title="Turn Off Two-Factor Authentication"
        description="Your account will be protected by its password alone, and your backup codes and authenticator app will stop working."
        confirmLabel={pending ? "Turning off…" : "Turn Off"}
        danger
        busy={pending}
        error={error}
        onConfirm={onConfirm}
        onClose={() => {
          if (pending) return;
          setOpen(false);
          setPassword("");
          setError(null);
        }}
      >
        <label className="ff-auth__field">
          <span className="ff-auth__label">Password</span>
          <input
            className="ff-auth__input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
      </ConfirmDialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

/**
 * The enrollment step machine, shown as a modal (native <dialog>, like
 * ConfirmDialog / AdminUnlockDialog — Esc + focus trapping come free) rather
 * than expanding inline, so turning on 2FA / adding an app feels like the code
 * entry it leads to. Open state is derived from the step (idle = closed); Esc
 * is blocked while a request is in flight.
 */
function TwoFactorDialog({
  open,
  busy,
  title,
  onClose,
  children,
}: {
  open: boolean;
  busy: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="ff-dialog"
      onClose={onClose}
      onCancel={(event) => {
        if (busy) event.preventDefault();
      }}
    >
      <h2 className="ff-dialog__title">{title}</h2>
      {children}
    </dialog>
  );
}

/** QR + typed-key fallback + the code that proves the app is really set up. */
function TotpSetup({
  totpURI,
  pending,
  onSubmit,
  onCancel,
}: {
  totpURI: string;
  pending: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  const key = manualEntryKey(totpURI);
  return (
    <form onSubmit={onSubmit}>
      <p className="ff-2fa__lede">
        Scan this with your authenticator app, then enter the six-digit code it
        shows.
      </p>
      <div className="ff-2fa__setup">
        <QrCode
          className="ff-2fa__qr"
          value={totpURI}
          alt="QR code for setting up your authenticator app"
        />
        {key ? (
          <div>
            <span className="ff-auth__label">Or type this key in</span>
            <code className="ff-2fa__key">{key}</code>
          </div>
        ) : null}
      </div>
      <CodeField label="Code from your app" />
      <Buttons pending={pending} submitLabel="Verify" onCancel={onCancel} />
    </form>
  );
}

/**
 * Shown exactly once, and never retrievable again — they're stored encrypted
 * and only ever handed back at the moment they're generated. Hence the
 * deliberate "I've saved these" acknowledgement rather than an auto-dismiss.
 */
function BackupCodes({
  codes,
  onDone,
}: {
  codes: string[];
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
    } catch {
      // Clipboard blocked (insecure origin, denied permission) — the codes are
      // on screen and selectable, so there's nothing to recover from.
      setCopied(false);
    }
  }

  return (
    <>
      <p className="ff-2fa__lede">
        <strong>Save these backup codes now.</strong> Each one signs you in once
        if you can&rsquo;t get a code any other way. This is the only time
        they&rsquo;ll be shown.
      </p>
      <ul className="ff-2fa__codes">
        {codes.map((code) => (
          <li key={code}>
            <code>{code}</code>
          </li>
        ))}
      </ul>
      <div className="ff-row__buttons">
        <button className="ff-btn ff-btn--sm" type="button" onClick={onDone}>
          I&rsquo;ve saved them
        </button>
        <button
          className="ff-btn ff-btn--outline ff-btn--sm"
          type="button"
          onClick={copy}
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </>
  );
}

/** One-time-code input. `inputMode` + `autocomplete` let phones offer the code
    straight from the notification or the authenticator app. Not shared with the
    sign-in challenge's near-identical field on purpose: importing across would
    drag the QR encoder into the login page's bundle. */
function CodeField({ label }: { label: string }) {
  return (
    <label className="ff-auth__field">
      <span className="ff-auth__label">{label}</span>
      <input
        className="ff-auth__input"
        name="code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={6}
        placeholder="123456"
        autoFocus
        required
      />
    </label>
  );
}

function Buttons({
  pending,
  submitLabel,
  onCancel,
}: {
  pending: boolean;
  submitLabel: string;
  onCancel: () => void;
}): ReactNode {
  return (
    <div className="ff-row__buttons">
      <button className="ff-btn ff-btn--sm" type="submit" disabled={pending}>
        {pending ? "Working…" : submitLabel}
      </button>
      <button
        className="ff-btn ff-btn--outline ff-btn--sm"
        type="button"
        onClick={onCancel}
        disabled={pending}
      >
        Cancel
      </button>
    </div>
  );
}
