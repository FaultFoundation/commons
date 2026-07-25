"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import {
  resendParentalConsent,
  submitRegistration,
} from "@/app/account/setup/actions";
import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { SETUP_DRAFT_KEY } from "@/components/dashboard/setup/draft";
import { SchoolTypeahead, type SchoolHit } from "@/components/dashboard/SchoolTypeahead";
import {
  AGE_RANGES,
  USER_TYPES,
  isMinor,
  isUnder13,
} from "@/lib/registration-shared";

export type AcademicInitialState = {
  status: string | null;
  userType: string | null;
  ageRange: string | null;
  country: string | null;
  schoolName: string | null;
  schoolWebsite: string | null;
  schoolEmail: string | null;
  graduationDate: string | null;
  countries: string[];
};

const TYPE_HINTS: Record<string, string> = {
  "University student": "Verify with your university email.",
  "University alumnus": "Verify with your school email, or staff review it.",
  "High school student": "A parent confirms by email if you're under 18.",
  "None of the above": "Join instantly with limited access.",
};

/**
 * Step 1 of setup, on one page as stacked bubbles. What happens on submit
 * depends on age and type: under-13 is turned away; a minor (13–17) has a
 * parent/guardian confirm by email; an adult guest joins instantly; a student,
 * alumnus, or 18+ high-schooler gets an emailed code (an alumnus without a
 * school email is parked in staff review).
 */
export function AcademicStep({ initial }: { initial: AcademicInitialState }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [consentSent, setConsentSent] = useState(
    initial.status === "CONSENT_PENDING",
  );
  const [consentEmail, setConsentEmail] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const [resendOk, setResendOk] = useState(false);

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
  const [parentEmail, setParentEmail] = useState("");

  // Draft persistence. Coming back from the code page ("change email") or via
  // the browser's Back button must not wipe what was typed — the server only
  // knows what was last submitted, and nothing at all before the first submit.
  // sessionStorage (not local) so the draft dies with the tab.
  const [draftLoaded, setDraftLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SETUP_DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as Record<string, unknown>;
        const str = (v: unknown) => (typeof v === "string" ? v : null);
        if (str(d.userType)) setUserType(d.userType as string);
        if (str(d.ageRange)) setAgeRange(d.ageRange as string);
        if (str(d.country)) setCountry(d.country as string);
        if (str(d.schoolName)) setSchoolName(d.schoolName as string);
        if (str(d.schoolWebsite)) setSchoolWebsite(d.schoolWebsite as string);
        if (str(d.schoolEmail)) setSchoolEmail(d.schoolEmail as string);
        if (str(d.graduationDate)) setGraduationDate(d.graduationDate as string);
        if (str(d.referrer)) setReferrer(d.referrer as string);
        if (str(d.circumstances)) setCircumstances(d.circumstances as string);
        if (str(d.parentEmail)) setParentEmail(d.parentEmail as string);
        if (typeof d.schoolId === "number") setSchoolId(d.schoolId);
        if (typeof d.manualSchool === "boolean") setManualSchool(d.manualSchool);
      }
    } catch {
      // Unparseable or unavailable storage: fall back to the server values.
    }
    setDraftLoaded(true);
  }, []);

  useEffect(() => {
    // Guarded on draftLoaded so the initial render can't clobber the draft
    // before it's been read back.
    if (!draftLoaded) return;
    try {
      sessionStorage.setItem(
        SETUP_DRAFT_KEY,
        JSON.stringify({
          userType,
          ageRange,
          country,
          schoolId,
          schoolName,
          schoolWebsite,
          schoolEmail,
          graduationDate,
          manualSchool,
          referrer,
          circumstances,
          parentEmail,
        }),
      );
    } catch {
      // Storage full or blocked — the form still works, just without a draft.
    }
  }, [
    draftLoaded,
    userType,
    ageRange,
    country,
    schoolId,
    schoolName,
    schoolWebsite,
    schoolEmail,
    graduationDate,
    manualSchool,
    referrer,
    circumstances,
    parentEmail,
  ]);

  const isNone = userType === "None of the above";
  const isHighSchool = userType === "High school student";
  const isUniversity =
    userType === "University student" || userType === "University alumnus";
  const needsGradDate = userType === "University student" || isHighSchool;
  const useManualEntry = isHighSchool || manualSchool;

  const under13 = isUnder13(ageRange);
  // A minor is 13–17; under-13 is handled separately as a hard block.
  const minor = isMinor(ageRange) && !under13;

  const canSubmit = under13
    ? false
    : minor
      ? Boolean(userType && ageRange && parentEmail.trim())
      : isNone
        ? Boolean(userType && ageRange)
        : Boolean(
            userType &&
              ageRange &&
              country &&
              schoolName.trim() &&
              schoolEmail.trim() &&
              (!needsGradDate || graduationDate),
          );

  function submit() {
    setError(null);
    startTransition(async () => {
      const input = minor
        ? {
            userType,
            ageRange,
            country,
            parentEmail,
            schoolName: isHighSchool ? schoolName : undefined,
            schoolWebsite: isHighSchool ? schoolWebsite : undefined,
          }
        : isNone
          ? { userType, ageRange, country, referrer, circumstances }
          : {
              userType,
              ageRange,
              country,
              schoolId:
                !useManualEntry && schoolId != null ? schoolId : undefined,
              schoolName,
              schoolWebsite,
              schoolEmail,
              graduationDate,
            };
      const result = await submitRegistration(input);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.outcome === "MANUAL_REVIEW") {
        // Don't dead-end here. Let them keep setting up — linking Discord opens
        // a support ticket, and the "under review" status surfaces once they
        // finish or leave setup (team step + account page).
        router.push("/account/setup/integrations/");
        return;
      }
      if (result.outcome === "CONSENT_PENDING") {
        setConsentEmail(result.parentEmail);
        setResendOk(false);
        setResendError(null);
        setConsentSent(true);
        return;
      }
      if (result.outcome === "VERIFIED") {
        router.push("/account/setup/integrations/");
        return;
      }
      router.push("/account/setup/code/");
    });
  }

  function onResend() {
    setResendError(null);
    setResendOk(false);
    startTransition(async () => {
      const result = await resendParentalConsent();
      if (!result.ok) {
        setResendError(result.error);
        return;
      }
      setResendOk(true);
    });
  }

  if (consentSent) {
    return (
      <div className="ff-card ff-reg">
        <h2 className="ff-reg__title">Check with Your Parent</h2>
        <p>
          We emailed{" "}
          {consentEmail ? (
            <strong>{consentEmail}</strong>
          ) : (
            "your parent or guardian"
          )}{" "}
          a link to approve your account. The moment they open it you&rsquo;re
          verified — you can move on and finish the rest of setup meanwhile.
        </p>
        {resendError ? (
          <div className="ff-auth__error" role="alert">
            <p>{resendError}</p>
          </div>
        ) : null}
        {resendOk ? (
          <p className="ff-row__saved" role="status">
            Sent again.
          </p>
        ) : null}
        <div className="ff-reg__nav">
          <button
            className="ff-btn ff-btn--outline"
            type="button"
            disabled={pending}
            onClick={onResend}
          >
            {pending ? "Sending…" : "Resend link"}
          </button>
          <a className="ff-btn" href="/account/setup/integrations/">
            Next
          </a>
        </div>
        <button
          className="ff-reg__alt"
          type="button"
          onClick={() => setConsentSent(false)}
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <div className="ff-bubble-grid ff-bubble-grid--single">
      {error ? (
        <div className="ff-auth__error ff-bubble--full" role="alert">
          <p>{error}</p>
        </div>
      ) : null}

      <Bubble title="Your Academic Status" span="full">
        <div className="ff-reg__choices" role="radiogroup" aria-label="Academic status">
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
      </Bubble>

      {/* Age decides the rest of the flow. Nothing shows until a type is
          picked, to keep the page from opening on a wall of fields. */}
      {!userType ? null : under13 ? (
        <Bubble title="One Moment" span="full">
          <p className="ff-auth__hint">
            You need to be at least 13 to register for the Fault Foundation.
            Thanks for your interest — come back when you&rsquo;re a little
            older.
          </p>
        </Bubble>
      ) : minor ? (
        <Bubble title="Parent or Guardian Consent" span="full">
          <p className="ff-auth__hint">
            Because you&rsquo;re under 18, a parent or guardian confirms your
            account by email. Enter their address and we&rsquo;ll send them a
            link — no documents, nothing else needed.
          </p>
          {isHighSchool ? (
            <label className="ff-auth__field">
              <span className="ff-auth__label">School name (optional)</span>
              <input
                className="ff-auth__input"
                type="text"
                value={schoolName}
                maxLength={200}
                onChange={(e) => setSchoolName(e.target.value)}
              />
            </label>
          ) : null}
          <label className="ff-auth__field">
            <span className="ff-auth__label">Parent or guardian email</span>
            <input
              className="ff-auth__input"
              type="email"
              value={parentEmail}
              maxLength={254}
              placeholder="parent@example.com"
              onChange={(e) => setParentEmail(e.target.value)}
            />
          </label>
          <div className="ff-reg__nav">
            <span />
            <button
              className="ff-btn"
              type="button"
              disabled={pending || !canSubmit}
              onClick={submit}
            >
              {pending ? "Sending…" : "Email my parent/guardian"}
            </button>
          </div>
        </Bubble>
      ) : isNone ? (
        <Bubble title="Join as a Guest" span="full">
          <p className="ff-auth__hint">
            Guests get in right away with community access. You can tell us who
            sent you if you like — it&rsquo;s optional.
          </p>
          <label className="ff-auth__field">
            <span className="ff-auth__label">
              Who referred you? (Discord username, optional)
            </span>
            <input
              className="ff-auth__input"
              type="text"
              value={referrer}
              maxLength={200}
              onChange={(e) => setReferrer(e.target.value)}
            />
          </label>
          <label className="ff-auth__field">
            <span className="ff-auth__label">Anything to add? (optional)</span>
            <textarea
              className="ff-auth__input ff-reg__textarea"
              value={circumstances}
              maxLength={2000}
              rows={4}
              placeholder="How did you find us?"
              onChange={(e) => setCircumstances(e.target.value)}
            />
          </label>
          <div className="ff-reg__nav">
            <span />
            <button
              className="ff-btn"
              type="button"
              disabled={pending || !canSubmit}
              onClick={submit}
            >
              {pending ? "Joining…" : "Join as guest"}
            </button>
          </div>
        </Bubble>
      ) : (
        <Bubble title="Your School" span="full">
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

          {/* The school directory is filtered by country, so the rest of the
              form stays hidden until one is picked — otherwise the typeahead
              silently returns nothing and looks broken. */}
          {!country ? (
            <p className="ff-auth__hint">
              Pick your country to search for your school.
            </p>
          ) : (
            <>
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

              <label className="ff-auth__field">
                <span className="ff-auth__label">Academic email</span>
                <input
                  className="ff-auth__input"
                  type="email"
                  value={schoolEmail}
                  maxLength={254}
                  placeholder="you@school.edu"
                  onChange={(e) => setSchoolEmail(e.target.value)}
                />
              </label>

              <label className="ff-auth__field">
                <span className="ff-auth__label">
                  {needsGradDate
                    ? "Expected graduation"
                    : "Graduation year (roughly is fine)"}
                </span>
                {/* Native month picker: shows MM and YYYY segments and stores
                    "YYYY-MM". Segment order follows the browser's locale and
                    can't be overridden. */}
                <input
                  className="ff-auth__input ff-auth__input--date"
                  type="month"
                  value={graduationDate}
                  onChange={(e) => setGraduationDate(e.target.value)}
                />
              </label>
            </>
          )}

          <div className="ff-reg__nav">
            <span />
            <button
              className="ff-btn"
              type="button"
              disabled={pending || !canSubmit}
              onClick={submit}
            >
              {pending ? "Sending…" : "Next"}
            </button>
          </div>
        </Bubble>
      )}
    </div>
  );
}
