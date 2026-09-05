// Regenerates db/seed/schools.sql from Hipo's university-domains-list dataset
// (MIT licensed) plus the small verified supplemental source in this directory.
//
//   npm run db:seed:generate     # writes school directory + favicon seed artifacts
//   npm run db:seed:local        # applies to the local D1
//   npm run db:seed:remote       # applies to production D1
//
// The seed DELETEs and re-inserts the whole table, so school ids are only
// stable within one generation — nothing may store a schools.id durably.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  SCHOOL_CORRECTIONS,
  SUPPLEMENTAL_SCHOOLS,
} from "./supplemental-schools.mjs";

const SOURCE_URL =
  "https://raw.githubusercontent.com/Hipo/university-domains-list/master/world_universities_and_domains.json";
const ROWS_PER_INSERT = 500;

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const seedDir = path.join(rootDir, "db", "seed");
const sqlFile = path.join(seedDir, "schools.sql");
const faviconSqlFile = path.join(seedDir, "school-favicons.sql");
const publicDir = path.join(rootDir, "public");
const jsonFile = path.join(publicDir, "schools.json");

const res = await fetch(SOURCE_URL);
if (!res.ok) {
  console.error(`Fetch failed: ${res.status} ${res.statusText}`);
  process.exit(1);
}
const data = await res.json();
if (!Array.isArray(data) || data.length < 1000) {
  console.error(`Unexpected dataset shape: array of ${data?.length ?? "?"} entries`);
  process.exit(1);
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const normalizeName = (value) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const normalizeDomain = (value) => value.trim().toLowerCase();
const faviconUrl = (host) =>
  `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
const hostOf = (webPage) => {
  try {
    return new URL(webPage).hostname.toLowerCase();
  } catch {
    return null;
  }
};
// Google's favicon service answers for the host it CRAWLED, and a number of
// schools serve their icon on www while the bare domain returns the generic
// globe (iwu.edu, kent.edu, cau.edu). So prefer the host the institution itself
// publishes — but only when it is the same domain, because a typo in the
// dataset's web_pages (Purdue Fort Wayne lists www.pdfw.edu against pfw.edu)
// must not repoint the icon at a hostname that doesn't exist. The `domain`
// column keeps the bare form either way: that is the durable affiliation, while
// this is only where the picture comes from.
const faviconHost = (domain, webPages) => {
  const host = hostOf(webPages[0] ?? "");
  return host === domain || host === `www.${domain}` ? host : domain;
};

const schools = [];
for (const entry of data) {
  const { name, country, alpha_two_code: alpha, domains, web_pages: webPages } = entry;
  if (
    typeof name !== "string" ||
    typeof country !== "string" ||
    typeof alpha !== "string" ||
    !Array.isArray(domains) ||
    !Array.isArray(webPages)
  ) {
    console.error("Skipping malformed entry:", JSON.stringify(entry).slice(0, 200));
    continue;
  }
  schools.push({
    name,
    country,
    alphaTwoCode: alpha,
    stateProvince: entry["state-province"] ?? null,
    domains,
    webPages,
  });
}

const correctionsByUpstreamName = new Map(
  SCHOOL_CORRECTIONS.map((correction) => [
    normalizeName(correction.match),
    correction,
  ]),
);
const appliedCorrections = new Set();
for (const school of schools) {
  const correction = correctionsByUpstreamName.get(normalizeName(school.name));
  if (!correction) continue;
  appliedCorrections.add(correction.match);
  if (correction.name) school.name = correction.name;
  if (correction.domains) school.domains = correction.domains.map(normalizeDomain);
  if (correction.webPages) school.webPages = correction.webPages;
}
const unappliedCorrections = SCHOOL_CORRECTIONS.filter(
  (correction) => !appliedCorrections.has(correction.match),
);
if (unappliedCorrections.length) {
  throw new Error(
    `School corrections matched no upstream record (fixed upstream? drop them): ${unappliedCorrections
      .map((correction) => correction.match)
      .join(", ")}`,
  );
}

const normalizedSchoolNames = new Set(
  schools.map((school) => normalizeName(school.name)),
);
const schoolDomains = new Set(
  schools.flatMap((school) =>
    school.domains
      .filter((domain) => typeof domain === "string" && domain.trim())
      .map(normalizeDomain),
  ),
);
for (const school of SUPPLEMENTAL_SCHOOLS) {
  const normalizedName = normalizeName(school.name);
  const domains = school.domains.map(normalizeDomain).filter(Boolean);
  if (!normalizedName || domains.length === 0) {
    throw new Error(`Supplemental school is missing a name or domain: ${school.name}`);
  }
  if (normalizedSchoolNames.has(normalizedName)) continue;
  const existingDomain = domains.find((domain) => schoolDomains.has(domain));
  if (existingDomain) {
    throw new Error(
      `Supplemental school domain already exists in Hipo data: ${school.name} (${existingDomain})`,
    );
  }
  schools.push({ ...school, domains });
  normalizedSchoolNames.add(normalizedName);
  domains.forEach((domain) => schoolDomains.add(domain));
}

const records = schools.map((school, index) => ({
  id: index + 1,
  ...school,
}));

const directory = records
  .map((school) => ({
    id: school.id,
    country: school.country,
    name: school.name,
    website: school.webPages[0] ?? "",
  }))
  .sort(
    (a, b) =>
      a.country.localeCompare(b.country, "en", { sensitivity: "base" }) ||
      a.name.localeCompare(b.name, "en", { sensitivity: "base" }) ||
      a.id - b.id,
  );

if (
  directory.length !== records.length ||
  new Set(directory.map((school) => school.id)).size !== directory.length ||
  directory.some((school) => school.id < 1 || school.id > directory.length)
) {
  throw new Error("Generated school directory has invalid ids.");
}

const rows = records.map(
  (school) =>
    `(${school.id},${q(school.name)},${q(school.country)},${q(school.alphaTwoCode)},` +
    `${school.stateProvince == null ? "NULL" : q(school.stateProvince)},` +
    `${q(JSON.stringify(school.domains))},${q(JSON.stringify(school.webPages))})`,
);

const faviconRows = records.flatMap((school) => {
  const domain = school.domains.find(
    (value) => typeof value === "string" && value.trim(),
  );
  const normalizedName = normalizeName(school.name);
  if (!domain || !normalizedName) return [];
  return [
    `(${school.id},${q(school.name)},${q(normalizedName)},${q(domain)},` +
      `${q(faviconUrl(faviconHost(domain, school.webPages)))})`,
  ];
});

if (rows.length !== directory.length) {
  throw new Error("Generated school SQL and static directory have different record counts.");
}

const statements = [];
for (let i = 0; i < rows.length; i += ROWS_PER_INSERT) {
  statements.push(
    "INSERT INTO schools (id,name,country,alpha_two_code,state_province,domains,web_pages) VALUES\n" +
      rows.slice(i, i + ROWS_PER_INSERT).join(",\n") +
      ";",
  );
}

const sql = `-- Generated by scripts/gen-schools-seed.mjs on ${new Date().toISOString().slice(0, 10)}
-- Sources: ${SOURCE_URL} (MIT licensed) + scripts/supplemental-schools.mjs
-- ${rows.length} schools. Apply with npm run db:seed:local / db:seed:remote.
DELETE FROM schools;
${statements.join("\n")}
`;

const faviconStatements = [];
for (let i = 0; i < faviconRows.length; i += ROWS_PER_INSERT) {
  faviconStatements.push(
    "INSERT INTO school_favicons (id,name,normalized_name,domain,favicon_url) VALUES\n" +
      faviconRows.slice(i, i + ROWS_PER_INSERT).join(",\n") +
      ";",
  );
}
const faviconSql = `-- Generated by scripts/gen-schools-seed.mjs on ${new Date().toISOString().slice(0, 10)}
-- Sources: ${SOURCE_URL} (MIT licensed) + scripts/supplemental-schools.mjs
-- Favicon URLs resolve each school's primary domain through Google's favicon service.
DELETE FROM school_favicons;
${faviconStatements.join("\n")}
`;

await Promise.all([
  mkdir(seedDir, { recursive: true }),
  mkdir(publicDir, { recursive: true }),
]);
await Promise.all([
  writeFile(sqlFile, sql),
  writeFile(faviconSqlFile, faviconSql),
  writeFile(jsonFile, `${JSON.stringify(directory)}\n`),
]);
console.log(
  `Wrote ${sqlFile}, ${faviconSqlFile}, and ${jsonFile}: ${directory.length} schools.`,
);
