// The Home note's message of the day (George, 2026-11-26: "fun themes or a message for the day").
// A theme for each weekday, holidays where they fall, and a line picked by date (same all day, new tomorrow),
// leaning on whether the month is ahead of or behind pace. Pure, tested in test/dailyNote.test.ts.

export interface DayTheme { name: string; message: string; tone: 'green' | 'blue' | 'amber' | 'violet' | 'red' }

const WEEK: [string, DayTheme['tone']][] = [
  ['Sunday Reset', 'violet'], ['Fresh Start Monday', 'blue'], ['Turnaround Tuesday', 'amber'], ['Win-It Wednesday', 'green'],
  ['Thankful Thursday', 'violet'], ['Finish-Strong Friday', 'green'], ['Saturday Hustle', 'amber'],
];

const AHEAD = [
  'You are ahead of pace. Protect the lead: first dial before 9.',
  'Momentum is real. Ride it while the phone is warm.',
  'Ahead of last month. Keep stacking the small wins.',
  'Your pace says goal. Your next ten dials make it certain.',
];
const BEHIND = [
  'One good presentation changes the whole week.',
  'The gap closes one booked appointment at a time.',
  'Callbacks first. Warm people buy.',
  'Every no gets you closer to the yes. Dial on.',
  'Twenty dials, five people, one appointment. Do the math, then do the dials.',
];
const ANY = [
  'Smile when you dial. They can hear it.',
  'Ask about the family early. It opens the door.',
  'Lead with what is free. Trust comes before price.',
  'Confirm every appointment the day before. Shows make sales.',
  'Name the union in your first sentence.',
  'Short calls, clear next step, real day and time.',
  'The best time to call back is the time they gave you.',
];

/** Fourth Thursday of November. */
const thanksgiving = (y: number) => { const first = new Date(Date.UTC(y, 10, 1)).getUTCDay(); return 1 + ((4 - first + 7) % 7) + 21; };

function holiday(y: number, m: number, d: number): DayTheme | null {
  if (m === 11 && d === thanksgiving(y)) return { name: 'Happy Thanksgiving', message: 'Grateful for every family you have protected this year. Enjoy the day.', tone: 'amber' };
  if (m === 12 && d === 25) return { name: 'Merry Christmas', message: 'Rest up. The families you helped this year are covered today.', tone: 'red' };
  if (m === 1 && d === 1) return { name: 'Happy New Year', message: 'New year, new goal. First appointment sets the tone.', tone: 'green' };
  if (m === 7 && d === 4) return { name: 'Happy Fourth', message: 'Enjoy the fireworks. Tomorrow we dial.', tone: 'red' };
  return null;
}

export function dayTheme(p: { y: number; m: number; d: number; wd: number }, ahead: boolean | null): DayTheme {
  const h = holiday(p.y, p.m, p.d);
  if (h) return h;
  const seed = p.y * 372 + p.m * 31 + p.d;
  const pool = ahead === true ? [...AHEAD, ...ANY] : ahead === false ? [...BEHIND, ...ANY] : ANY;
  const [name, tone] = WEEK[p.wd];
  return { name, tone, message: pool[seed % pool.length] };
}
