"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { submitRegistration } from "@/app/account/setup/actions";
import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { SETUP_DRAFT_KEY } from "@/components/dashboard/setup/draft";
import { SchoolTypeahead, type SchoolHit } from "@/components/dashboard/SchoolTypeahead";
import { AGE_RANGES, USER_TYPES } from "@/lib/registration-shared";

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
  "University alumnus": "Verify with your old school email, or we review by hand.",
  "High school student": "Verify with your school email.",
  "None of the above": "Tell us who referred you and we'll review by hand.",
};

/**
 * Step 1 of setup: everything the old four-screen register flow asked for,
 * on one page as two stacked bubbles. Submitting mails a code and moves to
 * /account/setup/code/ — except the "None of the above" path, which has no
 * address to verify and parks in manual review.
 */
export function AcademicStep({ initial }: { initial: AcademicInitialState }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState(initial.status === "MANUAL_REVIEW");

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
  ]);

  const isNone = userType === "None of the above";
  const isHighSchool = userType === "High school student";
  const isUniversity =
    userType === "University student" || userType === "University alumnus";
  const needsGradDate = userType === "University student" || isHighSchool;
  const useManualEntry = isHighSchool || manualSchool;

  const canSubmit = isNone
    ? Boolean(userType && ageRange && circumstances.trim())
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
      const result = await submitRegistration(
        isNone
          ? { userType, ageRange, country, referrer, circumstances }
          : {
              userType,
              ageRange,
              country,
              schoolId: !useManualEntry && schoolId != null ? schoolId : undefined,
              schoolName,
              schoolWebsite,
              schoolEmail,
              graduationDate,
            },
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.outcome === "MANUAL_REVIEW") {
        setReview(true);
        return;
      }
      router.push("/account/setup/code/");
    });
  }

  if (review) {
    return (
      <div className="ff-card ff-reg">
        <h2 className="ff-reg__title">We&rsquo;re On It</h2>
        <p>
          Your registration is with our staff for a manual look. You&rsquo;ll
          hear from us on Discord.
        </p>
        <div className="ff-reg__nav">
          <button
            className="ff-btn ff-btn--outline"
            type="button"
            onClick={() => setReview(false)}
          >
            Edit and resubmit
          </button>
          <a className="ff-btn" href="/account/setup/integrations/">
            Next
          </a>
        </div>
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

      {isNone ? (
        <Bubble title="A Bit of Context" span="full">
          <p className="ff-auth__hint">
            Non-students are welcome by referral. A staff member reviews these
            by hand, so the more context the better.
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
            <span />
            <button
              className="ff-btn"
              type="button"
              disabled={pending || !canSubmit}
              onClick={submit}
            >
              {pending ? "Submitting…" : "Submit for review"}
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
