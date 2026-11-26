// Core data shapes shared by the rules, the database layer and the screens.

export type NumberStatus = '' | 'Good' | 'Backup' | 'Bad' | 'Do Not Call' | 'Cannot Find';
export type Zone = '' | 'ET' | 'CT' | 'MT' | 'PT' | 'AKT' | 'HT' | '?';

/** What the last automatic number swap changed, so a disposition made right after it can put it back. */
export interface SwapMemo {
  at: number;                 // when the swap happened
  status: NumberStatus;       // number status before the swap
  mark: number | null;        // new-number mark before the swap
  cancelRest: boolean;        // the swap also started a rest that should be cancelled
  noteLine: string;           // the note line the swap added
}

export interface Contact {
  id: string;                 // permanent contact ID
  list: string;               // state name, or "Hardcards"
  tag: string;                // disposition tag, exact Rules text, '' = none
  dials: number;
  first: string;
  last: string;
  phone: string;              // main number
  job: string;
  company: string;
  city: string;
  state: string;
  backup: string;             // backup number
  notes: string;              // " | " separated, oldest first
  lastDialed: number | null;  // ms
  status: NumberStatus;
  callAt: number | null;      // callback / appointment time, or the end of a rest
  linkedin: string;
  zone: Zone;
  newNumberMark: number | null; // dial count when the current main number arrived; x.5 = no new-number priority
  callbackTries: number;
  noShowTries: number;
  /** No-answer follow-up calls since the last presentation (v2). */
  followUpTries?: number;
  swapMemo: SwapMemo | null;
  seq: number;                // original order inside its list (keeps the old row order for ties)
  /** When the current appointment was last confirmed (v2). */
  confirmedAt?: number | null;
  /** Quick qualifier tags picked on the call screen: Married, Kids, Union... (v2) */
  quals?: string[];
  /** Email given when booking or selling (calendar invite, policy email). */
  email?: string;
}

export type EventKind = 'Dial' | 'Tag' | 'Swap' | 'Note' | 'Import';

/** One Activity Log row. */
export interface LogEvent {
  at: number;
  contactId: string;
  list: string;
  first: string;
  last: string;
  phone: string;
  kind: EventKind;
  count: number;
  tag: string;
  dials: number;
  /** Tag rows only: a real person was reached (counts as a connect). */
  reach?: boolean;
}

export interface Result {
  contact: Contact;
  events: LogEvent[];
  message: string;
  ignored?: boolean;          // double click: nothing changed
  promoted?: boolean;         // backup became the main number
  dropped?: boolean;          // backup removed / numbers cleared
  refused?: string;           // reason the action was refused
}
