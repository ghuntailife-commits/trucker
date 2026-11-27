// Local match for texts (George, 2026-11-27). Made-up numbers; area codes only matter.
import { describe, expect, it } from 'vitest';
import { lineIn, pickFrom } from '../src/quo/localMatch';

const mine = ['+17865550100', '+16155550101', '+15155550102'];   // FL (Miami), TN (Nashville), IA
describe('local match', () => {
  it('same state first', () => { expect(pickFrom(mine, '(931) 555-0199').from).toBe('+16155550101'); });
  it('then same time zone', () => { expect(pickFrom(mine, '(214) 555-0199').from).toBe('+16155550101'); }); // TX is CT like Nashville
  it('then the main number', () => { expect(pickFrom(mine, '(206) 555-0199').from).toBe('+17865550100'); });
  it('an ongoing conversation keeps its line', () => {
    expect(pickFrom(mine, '(931) 555-0199', '+1 (515) 555-0102').from).toBe('+15155550102');
    expect(lineIn({ data: { object: { from: '+19315550199', to: ['+15155550102'] } } }, mine)).toBe('+15155550102');
  });
});
