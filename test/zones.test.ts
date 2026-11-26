// Time zones from city, state or area code. Made-up contacts only.
import { describe, expect, it } from 'vitest';
import { zoneFor, withZone } from '../src/contacts/zones';
import { contact } from './helpers';

const z = (city: string, state: string, phone = '', backup = '') => zoneFor({ city, state, phone, backup });

describe('time zones', () => {
  it('uses the state, and the city in states split across two zones', () => {
    expect(z('Atlanta', 'GA')).toEqual({ zone: 'ET', by: 'state' });
    expect(z('Dallas', 'TX')).toEqual({ zone: 'CT', by: 'city' });
    expect(z('El Paso', 'Texas')).toEqual({ zone: 'MT', by: 'city' });
    expect(z('Knoxville', 'TN')).toEqual({ zone: 'ET', by: 'city' });
    expect(z('Memphis', 'TN')).toEqual({ zone: 'CT', by: 'city' });
    expect(z('Louisville', 'KY').zone).toBe('ET');
    expect(z('Bowling Green', 'KY').zone).toBe('CT');
    expect(z('Pensacola', 'FL').zone).toBe('CT');
    expect(z('Tallahassee', 'FL').zone).toBe('ET');
    expect(z('Gary', 'IN').zone).toBe('CT');
    expect(z("Coeur d'Alene", 'ID').zone).toBe('PT');
  });
  it('falls back to the area code when there is no state, or no city in a split state', () => {
    expect(z('', '', '(865) 555-0100')).toEqual({ zone: 'ET', by: 'area code' });
    expect(z('', 'TN', '(865) 555-0100')).toEqual({ zone: 'ET', by: 'area code' });
    expect(z('', 'TN', '(615) 555-0100')).toEqual({ zone: 'CT', by: 'area code' });
    expect(z('', '', '', '915-555-0100')).toEqual({ zone: 'MT', by: 'area code' });
    expect(z('', '', '(850) 555-0100')).toEqual({ zone: 'ET', by: 'area code' });   // panhandle code covers both: state's main zone
    expect(z('', '')).toEqual({ zone: '', by: 'none' });
  });
  it('fills only blank zones', () => {
    expect(withZone(contact({ zone: '', city: 'Chattanooga', state: 'TN' })).zone).toBe('ET');
    expect(withZone(contact({ zone: 'CT', city: 'Chattanooga', state: 'TN' })).zone).toBe('CT');
  });
});
