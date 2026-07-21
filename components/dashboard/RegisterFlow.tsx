"use client";

import { useEffect, useState, useTransition } from "react";

import {
  resendCode,
  submitRegistration,
  verifyCode,
} from "@/app/dashboard/register/actions";
import { SchoolTypeahead, type SchoolHit } from "./SchoolTypeahead";
import { AGE_RANGES, USER_TYPES } from "@/lib/registration-shared";

export type RegisterInitialState = {
  status: string | null;
  userType: string | null;
  ageRange: string | null;
  country: string | null;
  schoolName: string | null;
  schoolWebsite: string | null;
  schoolEmail: string | null;
  graduationDate: string | null;
  countries: string[];
  /** Present only while a code is outstanding (status EMAIL_SENT). */
  verification: { attemptsRemaining: number; cooldownSeconds: number } | null;
};

const TYPE_HINTS: Record<string, string> = {
  "University student": "Verify with your university email.",
  "University alumnus": "Verify with your old school email, or we review by hand.",
  "High school student": "Verify with your school email.",
  "None of the above": "Tell us who referred you and we'll review by hand.",
};

type Step = 1 | 2 | 3 | 4 | "review" | "done";

export function RegisterFlow({ initial }: { initial: RegisterInitialState }) {
  const [step, setStep] = useState<Step>(() => {
    if (initial.status === "EMAIL_SENT") return 4;
    if (initial.status === "MANUAL_REVIEW") return "review";
    return 1;
  });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [userType, setUserType] = useState(initial.userType ?? "");
  const [ageRange, setAgeRange] = useState(initial.ageRange ?? "");
  const [country, setCountry] = useState(initial.country ?? "");
  const [schoolId, setSchoolId] = useState<number | null>(null);
  const [schoolName, setSchoolName] = useState(initial.schoolName ?? "");
  const [schoolWebsite, setSchoolWebsite] = useState(initial.schoolWebsite ?? "");
  const [schoolEmail, setSchoolEmail] = useState(initial.schoolEmail ?? "");
  const [graduationDate, setGraduationDate] = useState(initial.graduationDate ?? "");
  const [manualSchool, setManualSchool] = useState(false);
  const [referrer, setReferrer] = useState("");
  const [circumstances, setCircumstances] = useState("");

  const [code, setCode] = useState("");
  const [attemptsRemaining, setAttemptsRemaining] = useState(
    initial.verification?.attemptsRemaining ?? null,
  );
  const [cooldown, setCooldown] = useState(initial.verification?.cooldownSeconds ?? 0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const isNone = userType === "None of the above";
  const isHighSchool = userType === "High school student";
  const isUniversity =
    userType === "University student" || userType === "University alumnus";
  const needsGradDate = userType === "University student" || isHighSchool;
  const useManualEntry = isHighSchool || manualSchool;

  function goTo(next: Step) {
    setError(null);
    setStep(next);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await submitRegistration({
        userType,
        ageRange,
        country,
        schoolId: !useManualEntry && schoolId != null ? schoolId : undefined,
        schoolName,
        schoolWebsite,
        schoolEmail,
        graduationDate,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.outcome === "MANUAL_REVIEW") {
        goTo("review");
      } else {
        setCode("");
        setAttemptsRemaining(null);
        setCooldown(60);
        goTo(4);
      }
    });
  }

  function submitNone() {
    setError(null);
    startTransition(async () => {
      const result = await submitRegistration({
        userType,
        ageRange,
        country,
        referrer,
        circumstances,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      goTo("review");
    });
  }

  function onVerify() {
    setError(null);
    startTransition(async () => {
      const result = await verifyCode(code);
      if (result.ok) {
        goTo("done");
        return;
      }
      setError(result.error);
      if (typeof result.attemptsRemaining === "number") {
        setAttemptsRemaining(result.attemptsRemaining);
      }
    });
  }

  function onResend() {
    setError(null);
    startTransition(async () => {
      const result = await resendCode();
      if (!result.ok) {
        setError(result.error);
        if (result.cooldownSeconds) setCooldown(result.cooldownSeconds);
        return;
      }
      setCode("");
      setAttemptsRemaining(null);
      setCooldown(60);
    });
  }

  const stepLabels = ["About you", "Your school", "School email", "Enter code"];
  const numericStep = typeof step === "number" ? step : null;

  return (
    <div className="ff-card ff-reg">
      {numericStep !== null && !isNone ? (
        <ol className="ff-reg__steps" aria-label="Registration progress">
          {stepLabels.map((label, i) => (
            <li
              key={label}
              className={
                i + 1 === numericStep
                  ? "ff-reg__step ff-reg__step--current"
                  : i + 1 < numericStep
                    ? "ff-reg__step ff-reg__step--done"
                    : "ff-reg__step"
              }
              aria-current={i + 1 === numericStep ? "step" : undefined}
            >
              {label}
            </li>
          ))}
        </ol>
      ) : null}

      {error ? (
        <div className="ff-auth__error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}

      {step === 1 ? (
        <>
          <h2 className="ff-reg__title">Tell Us About You</h2>
          <div className="ff-reg__choices" role="radiogroup" aria-label="Membership type">
            {USER_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                className={
                  userType === type
                    ? "ff-reg__choice ff-reg__choice--selected"
                    : "ff-reg__choice"
                }
                role="radio"
                aria-checked={userType === type}
                onClick={() => setUserType(type)}
              >
                <strong>{type}</strong>
                <span>{TYPE_HINTS[type]}</span>
              </button>
            ))}
          </div>
          <label className="ff-auth__field">
            <span className="ff-auth__label">Age range</span>
            <select
              className="ff-auth__input"
              value={ageRange}
              onChange={(e) => setAgeRange(e.target.value)}
            >
              <option value="">Select…</option>
              {AGE_RANGES.map((range) => (
                <option key={range} value={range}>
                  {range}
                </option>
              ))}
            </select>
          </label>
          <div className="ff-reg__nav">
            <span />
            <button
              className="ff-btn"
              type="button"
              disabled={!userType || !ageRange}
              onClick={() => goTo(2)}
            >
              Next
            </button>
          </div>
        </>
      ) : null}

      {step === 2 && isNone ? (
        <>
          <h2 className="ff-reg__title">A Bit of Context</h2>
          <p className="ff-auth__hint">
            Non-students are welcome by referral. A staff member reviews these by
            hand, so the more context the better.
          </p>
          <label className="ff-auth__field">
            <span className="ff-auth__label">Who referred you? (Discord username, optional)</span>
            <input
              className="ff-auth__input"
              type="text"
              value={referrer}
              maxLength={200}
              onChange={(e) => setReferrer(e.target.value)}
            />
          </label>
          <label className="ff-auth__field">
            <span className="ff-auth__label">Your circumstances</span>
            <textarea
              className="ff-auth__input ff-reg__textarea"
              value={circumstances}
              maxLength={2000}
              rows={5}
              placeholder="How did you find us, and why would you like to join?"
              onChange={(e) => setCircumstances(e.target.value)}
            />
          </label>
          <div className="ff-reg__nav">
            <button className="ff-btn ff-btn--outline" type="button" onClick={() => goTo(1)}>
              Back
            </button>
            <button
              className="ff-btn"
              type="button"
              disabled={pending || !circumstances.trim()}
              onClick={submitNone}
            >
              {pending ? "Submitting…" : "Submit for review"}
            </button>
          </div>
        </>
      ) : null}

      {step === 2 && !isNone ? (
        <>
          <h2 className="ff-reg__title">Your School</h2>
          <label className="ff-auth__field">
            <span className="ff-auth__label">Country</span>
            <select
              className="ff-auth__input"
              value={country}
              onChange={(e) => {
                setCountry(e.target.value);
                setSchoolId(null);
              }}
            >
              <option value="">Select…</option>
              {initial.countries.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          {isUniversity && !manualSchool ? (
            <>
              <label className="ff-auth__field">
                <span className="ff-auth__label">School</span>
                <SchoolTypeahead
                  country={country}
                  value={schoolName}
                  onChange={(text) => {
                    setSchoolName(text);
                    setSchoolId(null);
                  }}
                  onPick={(hit: SchoolHit) => {
                    setSchoolId(hit.id);
                    setSchoolName(hit.name);
                    setSchoolWebsite(hit.website);
                  }}
                />
              </label>
              <button
                type="button"
                className="ff-reg__alt"
                onClick={() => {
                  setManualSchool(true);
                  setSchoolId(null);
                }}
              >
                My school isn&rsquo;t listed
              </button>
            </>
          ) : (
            <label className="ff-auth__field">
              <span className="ff-auth__label">School name</span>
              <input
                className="ff-auth__input"
                type="text"
                value={schoolName}
                maxLength={200}
                onChange={(e) => setSchoolName(e.target.value)}
              />
            </label>
          )}

          <label className="ff-auth__field">
            <span className="ff-auth__label">School website</span>
            <input
              className="ff-auth__input"
              type="text"
              value={schoolWebsite}
              maxLength={300}
              placeholder="https://www.example.edu"
              onChange={(e) => setSchoolWebsite(e.target.value)}
            />
          </label>

          {needsGradDate || userType === "University alumnus" ? (
            <label className="ff-auth__field">
              <span className="ff-auth__label">
                {needsGradDate ? "Expected graduation" : "Graduation year (roughly is fine)"}
              </span>
              <input
                className="ff-auth__input"
                type="month"
                value={graduationDate}
                onChange={(e) => setGraduationDate(e.target.value)}
              />
            </label>
          ) : null}

          <div className="ff-reg__nav">
            <button className="ff-btn ff-btn--outline" type="button" onClick={() => goTo(1)}>
              Back
            </button>
            <button
              className="ff-btn"
              type="button"
              disabled={!country || !schoolName.trim() || (needsGradDate && !graduationDate)}
              onClick={() => goTo(3)}
            >
              Next
            </button>
          </div>
        </>
      ) : null}

      {step === 3 ? (
        <>
          <h2 className="ff-reg__title">Your School Email</h2>
          <p className="ff-auth__hint">
            We&rsquo;ll send a verification code to prove you&rsquo;re part of{" "}
            <strong>{schoolName || "your school"}</strong>. School inboxes only —
            personal addresses go to manual review.
          </p>
          <label className="ff-auth__field">
            <span className="ff-auth__label">School email</span>
            <input
              className="ff-auth__input"
              type="email"
              value={schoolEmail}
              maxLength={254}
              placeholder="you@school.edu"
              onChange={(e) => setSchoolEmail(e.target.value)}
            />
          </label>
          <div className="ff-reg__nav">
            <button className="ff-btn ff-btn--outline" type="button" onClick={() => goTo(2)}>
              Back
            </button>
            <button
              className="ff-btn"
              type="button"
              disabled={pending || !schoolEmail.trim()}
              onClick={submit}
            >
              {pending ? "Sending…" : "Send code"}
            </button>
          </div>
        </>
      ) : null}

      {step === 4 ? (
        <>
          <h2 className="ff-reg__title">Check Your Inbox</h2>
          <p className="ff-auth__hint">
            We sent a code to <strong>{schoolEmail || "your school email"}</strong>.
            It expires in 24 hours.
            {typeof attemptsRemaining === "number" && attemptsRemaining < 5 ? (
              <> {attemptsRemaining} attempt{attemptsRemaining === 1 ? "" : "s"} left.</>
            ) : null}
          </p>
          <label className="ff-auth__field">
            <span className="ff-auth__label">Verification code</span>
            <input
              className="ff-auth__input ff-reg__code"
              type="text"
              value={code}
              maxLength={9}
              placeholder="XXXX-XXXX"
              autoComplete="one-time-code"
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && code.trim() && !pending) onVerify();
              }}
            />
          </label>
          <div className="ff-reg__nav">
            <button
              className="ff-btn ff-btn--outline"
              type="button"
              disabled={pending || cooldown > 0}
              onClick={onResend}
            >
              {cooldown > 0 ? `Resend (${cooldown}s)` : "Resend code"}
            </button>
            <button
              className="ff-btn"
              type="button"
              disabled={pending || !code.trim()}
              onClick={onVerify}
            >
              {pending ? "Checking…" : "Verify"}
            </button>
          </div>
          <p className="ff-auth__meta">
            Wrong address?{" "}
            <button type="button" className="ff-reg__alt ff-reg__alt--inline" onClick={() => goTo(3)}>
              Change email
            </button>
          </p>
        </>
      ) : null}

      {step === "review" ? (
        <>
          <h2 className="ff-reg__title">We&rsquo;re On It</h2>
          <p>
            Your registration is with our staff for a manual look — this happens
            when we can&rsquo;t automatically match your details to a school.
            You&rsquo;ll hear from us on Discord.
          </p>
          <div className="ff-reg__nav">
            <button className="ff-btn ff-btn--outline" type="button" onClick={() => goTo(1)}>
              Edit and resubmit
            </button>
            <a className="ff-btn" href="/dashboard/">
              Back to dashboard
            </a>
          </div>
        </>
      ) : null}

      {step === "done" ? (
        <>
          <h2 className="ff-reg__title">You&rsquo;re Verified! 🎉</h2>
          <p>
            Your school email checks out. Next up: link your Discord account from
            the dashboard so we can get you your roles.
          </p>
          <div className="ff-reg__nav">
            <span />
            <a className="ff-btn" href="/dashboard/">
              Back to dashboard
            </a>
          </div>
        </>
      ) : null}
    </div>
  );
}
