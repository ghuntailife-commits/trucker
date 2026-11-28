// Auto-dial logs no answers and voicemail machines by itself (George, 2026-11-28). Made-up numbers only.
import { describe, expect, it } from 'vitest';
import { outboundTwiml, amdRow, isMachine } from '../src/twilio/twilio';

const base = { to: '+12145550142', callerId: '+12145550100', base: 'https://d.com', agent: 'sam', contactPhone: '+12145550142', record: true, notice: true };

describe('auto-dial voicemail check', () => {
  it('asks Twilio to check for a machine only on auto-dial calls', () => {
    expect(outboundTwiml(base)).not.toContain('machineDetection');
    const x = outboundTwiml({ ...base, amdRef: 'sam-abc123' });
    expect(x).toContain('machineDetection="Enable"');
    expect(x).toContain('/api/twilio/amd?a=sam&amp;p=%2B12145550142&amp;r=sam-abc123');
  });
  it('treats machines and fax as voicemail, everything else as a person', () => {
    expect(isMachine('machine_start')).toBe(true);
    expect(isMachine('fax')).toBe(true);
    expect(isMachine('human')).toBe(false);
    expect(isMachine('unknown')).toBe(false);
    expect(isMachine(undefined)).toBe(false);
  });
  it('stores the answer under the call reference for the screen to find', () => {
    const row = amdRow({ AnsweredBy: 'machine_start', CallSid: 'CA1', MachineDetectionDuration: '2400' }, 'sam', 'sam-abc123', '+12145550142');
    expect(row).toMatchObject({ id: 'call.amd:sam-abc123', type: 'call.amd', agent_id: 'sam', applied: true, payload: { answeredBy: 'machine_start', secs: 2.4 } });
    expect(amdRow({ CallSid: 'CA1' }, 'sam', 'sam-abc123', '')).toBeNull();
    expect(amdRow({ AnsweredBy: 'human' }, 'sam', '', '')).toBeNull();
  });
});
