# Change log: v27 sheet → web app

Changes from the v27 Google Sheet, and why. "George" = approved by George; "Brief" = follows the written rules in the brief; everything else keeps the intent of the old feature.

| Date | Change | Why |
| --- | --- | --- |
| 2026-11-26 | Platform: web app with one shared database instead of ~20 sheets | George |
| 2026-11-26 | "Unverified" number status dropped; new numbers, rests and promoted backups leave status blank | George |
| 2026-11-26 | Main number bad and backup already known bad: both numbers cleared, contact goes to Needs Number (v27 only did this when the backup was already in the main spot; otherwise it just marked Bad) | Brief section 6 |
| 2026-11-26 | Every contact has a permanent ID; actions find the contact by ID, so "that row moved, re-sort" can no longer happen | Safety (wrong-number incident) |
| 2026-11-26 | Callback tries, no-show tries and the last automatic swap are stored on the contact itself, not in hidden script storage keyed by tab + row | Counts could attach to the wrong person after sorting |
| 2026-11-26 | Rest length is its own setting (7 days). v27 read it from Rules G11, the same cell as the "8 or more dials" spacing, so changing one changed the other | Clarity |
| 2026-11-26 | All date logic runs on Eastern time explicitly, including daylight-saving changes | Server may run in another time zone |
| 2026-11-26 | Today list is computed by the app (same filters and ranking as the old Today!C5 formula), not by a live spreadsheet formula | Speed: no 2.5 s recalculation |
| 2026-11-26 | Backup-number double-press guard (90 s) kept separate from the main Dial +1 guard (2 min) | Same as v27 sidebar |

## 2026-11-26: Today is one big list
- The three-panel dialer (queue, big card, side) is replaced by one full-width list. The contact being dialed is an open row with the Call button, facts, history and keys 1–6 inside it.
- Picking a result closes that row (marked done with a check) and opens the next one, scrolling it into view. Auto-dial works the same way.
- Click any row to open it. The Dialer/List switch is gone since the list is now the dialer.

## 2026-11-26: Today matches George's mockup
- Navy console look with serif headings, top navigation (other pages come in later stages), search, day/night.
- "Today's Call Queue" title with pass number and progress, and an 8-number strip: left to dial, dials, connects, scheduled, called into, presented, sold, ALP today.
- Full-width queue table with filter tabs (All, Callbacks, No-shows, New numbers, Retry, Fresh), Auto-dial, Re-sort and Export CSV. Done rows dim, sold rows green, the current contact highlighted.
- "On the line" panel: big green Call button, backup number, result keys 1–6, note, history and research, plus Up Next.
- Appointments & called into list with status pills (hover a row for Sold / Presented / No-show / Move), and a dials & connects by hour chart with the best window.
- New shortcuts: N note, U undo, R re-sort (plus 1–6, C call, / search, S skip, B backup).

## 2026-11-26: Contacts and Needs Number pages (stage 4)
- Contacts: every contact on every list, with group tabs, list filter, search, sortable columns, and Export CSV of what is shown.
- Contact details: edit any field. Every change is listed before it is saved; numbers are checked (10 digits, not already marked bad, not on another contact). Add a note, see notes and activity, Open in dialer, Delete (with a confirm; logged dials stay; Undo works).
- Add contact and Import: the sheet's Import columns (First, Last, Phone, Job, Company, City, State, LinkedIn, Backup, Notes). Paste from a spreadsheet or pick a CSV. A check step shows each line's result (imports to which list, or skipped as a duplicate, Do Not Call, given to another agent, unknown state) before anything is saved. Hardcards import option.
- Needs Number: three lists (needs a number, needs a new number after a bad number, cannot find). Type numbers in the rows; they are tied to the contact, so a list that changes while you type can't misplace them. Review and save shows what will and won't be saved and why. Cannot Find marks with a dated note; Return sends them back.
- Bad numbers are now recognised however they are written (214-555-0101 and (214) 555-0101 are the same number).
- Today: dialed rows are highlighted green again, like the sheet. Sold rows are a deeper green.
