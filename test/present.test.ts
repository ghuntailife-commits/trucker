// Presentation coaching from Google Meet (George, 2026-11-27). Made-up people and events.
import { describe, expect, it } from 'vitest';
import { matchEvent, meetDocs, presNote, presSums, readPresTool, type CalEvent } from '../src/meet/present';

const people = [{ id: 'c1', n: 'Sam Testwell', p: '+15555550141' }, { id: 'c2', n: 'Pat Example', p: '(555) 555-0142' }];
const doc = (title: string) => ({ fileId: title, title, mimeType: 'application/vnd.google-apps.document', fileUrl: 'https://docs.google.com/x' });

describe('meet presentations', () => {
  it('finds the transcript first, then Gemini notes, and ignores other files', () => {
    const ev: CalEvent = { id: 'e', attachments: [doc('Notes by Gemini'), { fileId: 'v', title: 'Recording', mimeType: 'video/mp4' }, doc('Sam - 2026/11/27 - Transcript')] };
    expect(meetDocs(ev).map(d => d.title)).toEqual(['Sam - 2026/11/27 - Transcript', 'Notes by Gemini']);
    expect(meetDocs({ id: 'x', attachments: [doc('Agenda')] })).toEqual([]);
  });
  it('matches by Dispatch event, then phone, then full name', () => {
    expect(matchEvent({ id: 'a', extendedProperties: { private: { contactId: 'c2', uid: 'c2:appt' } } }, people)?.id).toBe('c2');
    expect(matchEvent({ id: 'b', summary: 'Presentation 555-555-0141' }, people)?.id).toBe('c1');
    expect(matchEvent({ id: 'c', summary: 'Zoom w/ pat example' }, people)?.id).toBe('c2');
    expect(matchEvent({ id: 'd', summary: 'Team meeting' }, people)).toBeNull();
  });
  it('reads Claude\'s answer and sums it', () => {
    const got = readPresTool({ summary: 'Talked it through.', outcome: 'No sale', objections: ['Money is tight'], why_not: ['Never asked for the sale'], close_asked: false,
      close_how: 'Ran out of time.', products: [], went_well: 'Friendly', try_next: 'Ask', exchanges: [], facts: [] })!;
    expect(got.tags.outcome).toBe('Presented');
    expect(presNote(got.note, got.tags)).toBe("Presentation notes (AI): Talked it through. Why it didn't close: Never asked for the sale.");
    const s = presSums([{ id: '1', at: 0, phone: '', title: '', note: '', tags: got.tags }]);
    expect([s.total, s.noSale, s.asked, s.objections[0].label]).toEqual([1, 1, 0, 'Money is tight']);
    expect(readPresTool({ summary: '' })).toBeNull();
  });
});

describe('presentations not on this Dispatch', () => {
  it('reads a phone or a plain name title as a presentation, not meetings', async () => {
    const { guessPerson } = await import('../src/meet/present');
    expect(guessPerson({ id: '1', summary: 'Sam Testwell - 555-555-0141' })).toEqual({ id: '', n: 'Sam Testwell', p: '5555550141' });
    expect(guessPerson({ id: '2', summary: 'Jo Example - Knight-Swift - (555) 555-0142 - FL' })?.p).toBe('5555550142');
    expect(guessPerson({ id: '3', summary: 'Kellie Example' })?.n).toBe('Kellie Example');
    expect(guessPerson({ id: '4', summary: 'Team meeting' })).toBeNull();
    expect(guessPerson({ id: '5', summary: 'lunch' })).toBeNull();
  });
});
