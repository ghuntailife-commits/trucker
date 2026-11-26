// Sales from company leads and referrals, entered on Results. Made-up names only.
import { describe, expect, it } from 'vitest';
import { et } from './helpers';
import { outsideSale } from '../src/rules/results';

const sale = { alpType: 'Trial' as const, alp: 900, monthly: 75, wholeLife: 20000, adb: 0, email: '', note: '' };
describe('outside sales', () => {
  it('needs a name and keeps where it came from', () => {
    expect(outsideSale({ source: 'referral', first: ' ', last: '', phone: '', company: '', at: et(26, 12), id: 'a' }, sale)).toEqual({ error: "Enter the client's name." });
    const r = outsideSale({ source: 'referral', first: 'Avery', last: 'Test', phone: '', company: 'Acme', at: et(26, 12), id: 'a' }, sale);
    expect('ok' in r && r.ok).toMatchObject({ contactId: 'out-a', source: 'referral', calledInto: false, alp: 900, who: { first: 'Avery', list: 'Referral', company: 'Acme' } });
  });
});
