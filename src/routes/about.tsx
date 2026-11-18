import { createFileRoute } from "@tanstack/react-router";
import { Card, Ext, Eyebrow, H1, Section } from "../components/ui";

export const Route = createFileRoute("/about")({ component: About });

const CSRC = "https://csrc.nist.gov/projects";

function About() {
  return (
    <article className="max-w-3xl space-y-6 text-[14px]">
      <header className="space-y-1">
        <Eyebrow>About</Eyebrow>
        <H1>How this is built</H1>
      </header>
      <Section title="Sources">
        <Card className="space-y-2 p-4">
          <p>
            Certificates come from the <Ext href={`${CSRC}/cryptographic-module-validation-program/validated-modules/search`}>CMVP validated modules search</Ext> (every status:
            Active, Historical, Revoked) and each certificate page. Each Approved Algorithms entry links to a{" "}
            <Ext href={`${CSRC}/cryptographic-algorithm-validation-program/validation-search`}>CAVP validation</Ext>; every cited validation is fetched in its expanded view
            for tested capabilities and operating environments.
          </p>
          <p>
            Coverage: FIPS 140-3 and FIPS 140-2. FIPS 140-2 certificates name algorithms broadly (&ldquo;AES&rdquo;, &ldquo;SHS&rdquo;, &ldquo;CVL&rdquo;) and often cite
            several CAVP certificates per algorithm, including pre-ACVP ones numbered per algorithm (&ldquo;AES 4030&rdquo;). Their capabilities show every CAVP algorithm of that
            family on the cited validation.
          </p>
        </Card>
      </Section>
      <Section title="Updates">
        <Card className="space-y-2 p-4">
          <p>
            A scheduled GitHub Action refetches the CMVP search lists, re-crawls only certificates that are new or whose status or validation dates changed, and fetches CAVP
            validations the first time a certificate cites them. FIPS 140-2 has no active certificates left, so it was captured once and is not part of the daily run. Each record is a JSON file in the repository's <code>data/</code> folder, so the git history doubles as a change log.
          </p>
        </Card>
      </Section>
      <Section title="Caveats">
        <Card className="space-y-2 p-4">
          <ul className="m-0 list-disc space-y-1 pl-5">
            <li>This is a convenience index, not an official NIST product. The NIST certificate and Security Policy are authoritative.</li>
            <li>A CAVP validation can cover more algorithms and environments than the module claims; certificate pages show only the module's claimed entries.</li>
            <li>A few CSRC certificate pages render only part of their details; those records are marked and fall back to the search list for vendor and module.</li>
            <li>Vendor contact email addresses are obfuscated on CSRC and are deliberately not reproduced here.</li>
          </ul>
        </Card>
      </Section>
    </article>
  );
}
