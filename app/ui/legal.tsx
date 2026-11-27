// Public pages for texting registration (George, 2026-11-27): privacy policy, SMS terms, verbal consent script.
// No sign-in. Brand: George Hunt Insurance Team.
export const BRAND = 'George Hunt Insurance Team';
export const ADDRESS = '176 Northwest 25th Street, Miami, FL';
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return <main className="legal">
    <p className="legal-brand">{BRAND}</p>
    <h1>{title}</h1>
    <p className="legal-date">Last updated {updated}</p>
    {children}
    <p className="legal-foot">{BRAND} · {ADDRESS}</p>
  </main>;
}
