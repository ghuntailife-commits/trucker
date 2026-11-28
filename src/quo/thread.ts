// The texts with one contact, back and forth, read from their notes (George, 2026-11-27): shown as a chat above
// the text box so a conversation can carry on. Pure, tested in test/twilioSms.test.ts.
export interface TextMsg { day: string; mine: boolean; text: string }

const LINE = /^(\d{1,2}\/\d{1,2})(?: [^:]*?)?: (Texted \((?:Quo|Dispatch)\)|Text from them): "([\s\S]*)"$/;

export function textThread(notes: string, max = 12): TextMsg[] {
  const out: TextMsg[] = [];
  for (const raw of String(notes || '').split(' | ')) {
    const m = LINE.exec(raw.trim());
    if (m) out.push({ day: m[1], mine: m[2] !== 'Text from them', text: m[3] });
  }
  return out.slice(-max);
}
