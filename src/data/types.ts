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

export type ApprovedEntry = { algorithm: string; cavp_cert: string; cavp_id: string };

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
    contacts: Array<{ name: string; phone: string; fax: string }>;
  };
  files: Array<{ label: string; url: string }>;
  history: Array<{ date: string; type: string; lab: string }>;
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
