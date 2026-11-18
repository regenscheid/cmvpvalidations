/** Row in public/data/modules.json — one per CMVP certificate (see scripts/build_site_data.py). */
export type ModuleRow = {
  cert: number;
  standard: string;
  status: string;
  vendor: string;
  module: string;
  type: string;
  embodiment: string;
  level: string;
  sunset: string;
  first: string;
  last: string;
  labs: string[];
  caveat: string;
  families: string[];
  pqc: string[];
  algorithms: string[];
  cavp: string[];
  sparse: boolean;
  /** ESV certificates inferred to serve this module (they share a CAVP validation). */
  esv: number[];
};

export type Meta = {
  snapshot: string;
  standards: string[];
  certificates: number;
  by_status: Record<string, number>;
  cavp_validations: number;
  cavp_cited: number;
  families: string[];
};

export type AlgorithmRow = { name: string; family: string; modules: number; active: number };

/** FIPS 140-2 entries also carry `cavp_ref` ("AES:4030", the CAVP source and number they link to). */
/**
 * One (algorithm, CAVP certificate) pair. FIPS 140-2 rows without a CAVP link keep their text in `note`;
 * certificates that text names ("AES Cert. #5907 and HMAC Cert. #3889; ...") become entries with `from_note`.
 */
export type ApprovedEntry = {
  algorithm: string;
  cavp_cert: string;
  cavp_id: string;
  cavp_ref?: string;
  note?: string;
  from_note?: boolean;
  /** Set when the cited reference did not resolve and this validation was inferred; why, and as what it was cited. */
  inferred?: string;
  cited_as?: string;
};

/** public/data/cmvp/<cert>.json — written by scripts/cmvp_crawl.py. */
export type CertRecord = {
  cert: number;
  url: string;
  module: string;
  standard: string;
  status: string;
  sunset: string;
  level: string;
  caveat: string;
  level_exceptions: string[];
  type: string;
  embodiment: string;
  description: string;
  tested_configurations: string[];
  allowed_algorithms: string;
  non_approved_algorithms: string;
  entropy: string;
  software_versions: string;
  hardware_versions: string;
  firmware_versions: string;
  piv_cert: string;
  product_url: string;
  approved: ApprovedEntry[];
  vendor: string;
  vendor_info: {
    name: string;
    website: string;
    address: string[];
    /** Names only: phone and fax numbers are not kept, and emails are not decoded. */
    contacts: Array<{ name: string }>;
  };
  files: Array<{ label: string; url: string }>;
  history: Array<{ date: string; type: string; lab: string }>;
  /** Added by build_site_data.py: entropy sources inferred from a shared CAVP validation. */
  esv_links?: EsvLink[];
  first_validated: string;
  last_updated: string;
  labs: string;
  security_policy: string;
  other_fields: Record<string, string | string[]>;
  sparse: boolean;
  fetched: string;
};

/** public/data/cavp/<id>.json — one CAVP validation, expanded view. */
export type CavpRecord = {
  cavp_id: string;
  cavp_cert: string;
  url: string;
  implementation: string;
  product_id: string;
  description: string;
  version: string;
  type: string;
  first_validated: string;
  vendor: string;
  vendor_website: string;
  oes: Array<{ name: string; details: string[] }>;
  algorithms: Array<{ algorithm: string; oe: number; capabilities: string[] }>;
  /** Set when the expanded view timed out and the record was built from the collapsed view. */
  partial?: string;
  fetched: string;
};

/** A CAVP validation that ties a module to an ESV certificate of the same vendor (the ESV's vetted conditioning component). */
export type EsvVia = { cavp_id: string; cavp_cert: string; algorithm: string };

/** On a certificate record: an entropy source it is inferred to use. */
export type EsvLink = {
  esv: number;
  cert: string;
  implementation: string;
  vendor: string;
  noise_source: string;
  via: EsvVia[];
};

/** public/data/esv.json — one row per entropy source (ESV) certificate. */
export type EsvRow = {
  esv: number;
  cert: string;
  vendor: string;
  implementation: string;
  description: string;
  noise_source: string;
  reuse: string;
  standard: string;
  first: string;
  last: string;
  labs: string[];
  oes: number;
  conditioning: string[];
  modules: number[];
};

/** public/data/esv/<n>.json — written by scripts/cmvp_crawl.py, plus inferred modules from build_site_data.py. */
export type EsvRecord = {
  esv: number;
  cert: string;
  url: string;
  implementation: string;
  standard: string;
  description: string;
  version: string;
  noise_source: string;
  reuse: string;
  entries: Array<{
    bits_per_output: string;
    output_bits: string;
    oes: string[];
    conditioning: Array<{ cavp_cert: string; cavp_id: string; algorithm: string }>;
  }>;
  vendor: string;
  vendor_info: { name: string; website: string; address: string[] };
  files: Array<{ label: string; url: string }>;
  history: Array<{ date: string; lab: string }>;
  first: string;
  last: string;
  labs: string[];
  modules: Array<{ cert: number; module: string; vendor: string; status: string; via: EsvVia[] }>;
};
