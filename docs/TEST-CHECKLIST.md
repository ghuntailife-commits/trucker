# Rules test checklist

Each line is an automated test in `test/rules.test.ts` or `test/today.test.ts`. Run with `npm test`.

## Dial +1
- [x] Adds a dial, stamps Last dialed, one log row
- [x] Second Dial +1 within 2 minutes ignored; counts again after 2 minutes

## Callbacks
- [x] No try counted while the callback day is in the future
- [x] Tries 1 and 2 add dated notes and keep the tag
- [x] 3rd miss clears tag and Call At, back to normal retries
- [x] A new callback time restarts the count

## No-shows
- [x] 3 tries keep the tag; 4th returns to normal retries
- [x] No-show note uses the real appointment time; Why shows "No-show · date"
- [x] A new tag restarts the count

## Main / backup numbers
- [x] 7 dials, nobody reached: swap, status Backup, Swap log row
- [x] 7 more on the backup: swap back and rest 7 days
- [x] Rest ends on the next dial
- [x] Status Good never swaps; tagged contacts never swap; known-bad backup never used
- [x] A disposition within 20 minutes of the swapping dial puts the numbers back; after 20 minutes it does not

## Bad numbers
- [x] Bad main + good backup: backup becomes main with new-number priority
- [x] Bad backup in the main spot: numbers go back, contact rests
- [x] Both bad (either way round): both cleared, goes to Needs Number
- [x] No backup: status Bad, tag stays
- [x] Replacement number already marked bad is refused
- [x] Bad backup in dialer backup mode removes only the backup

## Dispositions
- [x] First disposition of the day counts as the dial; after Dial +1 it does not
- [x] No-show, Sold, Presented, Given to another agent never count as a dial
- [x] Do not call / Given to another agent → status Do Not Call
- [x] Scheduled keeps Call At; other tags clear it

## Next action, quick notes, times, dialer, undo
- [x] Next action by dial count / by tag / Call At; none for fresh, bad, do not call
- [x] Quick note: plain note, time → callback, note @ time, past time refused, other tags not overwritten
- [x] Plain-English times incl. daylight-saving change
- [x] Dialer: voicemail note, double press, callback needs a time, appointment on the backup promotes it
- [x] Rules never change the original copy (Undo restores the snapshot)

## Today list
- [x] Excludes bad, do not call, given, sold, presented, scheduled, called-into, no number
- [x] Rest and 75-day re-approach timing
- [x] Order: confirms, callbacks, no-shows, new numbers, then retries mixed ~7:3 with fresh
- [x] Fresh contacts alternate between states; fewer dials first among retries
- [x] New-number priority lasts 2 dials; "New Number-backup" label
- [x] Saved order kept; dialed contacts stay as DONE TODAY; late arrivals go after
- [x] PM retry after a 3 PM re-sort
- [x] Appointments list: called-into first, then by time, with status labels
- [x] List capped at 200
