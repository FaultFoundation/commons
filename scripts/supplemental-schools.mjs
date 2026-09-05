// Officially verified institutions absent from Hipo's university-domains-list.
// Keep this list limited to records needed by the application and retain the
// canonical institution name plus its official primary domain.
export const SUPPLEMENTAL_SCHOOLS = [
  {
    name: "Albright College",
    country: "United States",
    alphaTwoCode: "US",
    stateProvince: "Pennsylvania",
    domains: ["albright.edu"],
    webPages: ["https://www.albright.edu/"],
  },
  {
    name: "Cumberland University",
    country: "United States",
    alphaTwoCode: "US",
    stateProvince: "Tennessee",
    domains: ["cumberland.edu"],
    webPages: ["https://www.cumberland.edu/"],
  },
  {
    name: "C\u00e9gep de Drummondville",
    country: "Canada",
    alphaTwoCode: "CA",
    stateProvince: "Quebec",
    domains: ["cegepdrummond.ca"],
    webPages: ["https://www.cegepdrummond.ca/"],
  },
  {
    name: "Columbia International University",
    country: "United States",
    alphaTwoCode: "US",
    stateProvince: "South Carolina",
    domains: ["ciu.edu"],
    webPages: ["https://ciu.edu/"],
  },
  {
    name: "Fisher College",
    country: "United States",
    alphaTwoCode: "US",
    stateProvince: "Massachusetts",
    domains: ["fisher.edu"],
    webPages: ["https://www.fisher.edu/"],
  },
  {
    name: "Indiana University Northwest",
    country: "United States",
    alphaTwoCode: "US",
    stateProvince: "Indiana",
    domains: ["northwest.iu.edu"],
    webPages: ["https://northwest.iu.edu/"],
  },
  {
    name: "Lubbock Christian University",
    country: "United States",
    alphaTwoCode: "US",
    stateProvince: "Texas",
    domains: ["lcu.edu"],
    webPages: ["https://lcu.edu/"],
  },
  {
    name: "Manchester University",
    country: "United States",
    alphaTwoCode: "US",
    stateProvince: "Indiana",
    domains: ["manchester.edu"],
    webPages: ["https://www.manchester.edu/"],
  },
  {
    name: "Mount Aloysius College",
    country: "United States",
    alphaTwoCode: "US",
    stateProvince: "Pennsylvania",
    domains: ["mtaloy.edu"],
    webPages: ["https://www.mtaloy.edu/"],
  },
  {
    name: "Mount Vernon Nazarene University",
    country: "United States",
    alphaTwoCode: "US",
    stateProvince: "Ohio",
    domains: ["mvnu.edu"],
    webPages: ["https://www.mvnu.edu/"],
  },
  {
    name: "Spalding University",
    country: "United States",
    alphaTwoCode: "US",
    stateProvince: "Kentucky",
    domains: ["spalding.edu"],
    webPages: ["https://www.spalding.edu/"],
  },
];

// Corrections to institutions that ARE in Hipo's dataset but carry a stale name
// or a retired domain. A correction rewrites the upstream record in place rather
// than adding a second row, so one institution never appears twice. The
// generator throws when a `match` no longer names an upstream record, so an
// upstream fix surfaces as a build failure instead of silently doing nothing.
export const SCHOOL_CORRECTIONS = [
  {
    // Renamed in 2010, and muc.edu has since been retired — which made the
    // generated favicon Google's generic globe rather than the school's mark.
    match: "Mount Union College",
    name: "University of Mount Union",
    domains: ["mountunion.edu"],
    webPages: ["https://www.mountunion.edu/"],
  },
];