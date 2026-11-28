// Ring my cell (George, 2026-11-27). Made-up numbers and names.
import { describe, expect, it } from 'vitest';
import { bridgeTwiml, cellReady, nameFor, sayName, whisperTwiml } from '../src/twilio/cell';
import { inboundTwiml, outboundTwiml } from '../src/twilio/twilio';
import { ownerOf } from '../src/live/parts';

describe('ring my cell', () => {
  it('is ready only when on with a full number', () => {
    expect(cellReady({ on: true, cell: '615-555-0100' })).toBe(true);
    expect(cellReady({ on: false, cell: '615-555-0100' })).toBe(false);
    expect(cellReady({ on: true, cell: '555-0100' })).toBe(false);
  });
  it('says the name, then dials as usual', () => {
    const dial = outboundTwiml({ to: '+16155550199', callerId: '+16155550100', base: 'https://x.test', agent: 'pat', contactPhone: '+16155550199', record: true, notice: true });
    const t = bridgeTwiml('Sam <Sample>', dial);
    expect(t).toMatch(/^<\?xml[^>]*><Response><Say voice="Polly.Joanna">Calling Sam Sample\.<\/Say><Dial callerId="\+16155550100"/);
    expect(sayName('  Jo-Ann   O\'Neil ')).toBe("Jo-Ann O'Neil");
    expect(whisperTwiml('')).toContain('Dispatch call.');
  });
  it('incoming rings the computer and the cell, showing the caller', () => {
    const t = inboundTwiml({ agent: 'pat', base: 'https://x.test', from: '+16155550199', cell: '+16155550123', name: 'Sam Sample' });
    expect(t).toContain('callerId="+16155550199"');
    expect(t).toContain('<Client>pat</Client><Number url="https://x.test/api/twilio/whisper?n=Sam%20Sample">+16155550123</Number>');
    expect(inboundTwiml({ agent: 'pat', base: 'https://x.test', from: '+16155550199' })).not.toContain('<Number');
  });
  it('finds a name by phone', () => {
    expect(nameFor([[{ first: 'Sam', last: 'Sample', phone: '(615) 555-0199' }], [{ first: 'Al', last: 'Other', phone: '', backup: '615-555-0177' }]], '+16155550177')).toBe('Al Other');
    expect(nameFor([], '+16155550177')).toBe('');
  });
  it('agents can save their own cell and signature', () => {
    expect(ownerOf('dispatch-cell-austin')).toBe('austin'); expect(ownerOf('dispatch-sig-austin')).toBe('austin');
  });
});
