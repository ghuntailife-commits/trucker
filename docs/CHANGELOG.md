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

## 2026-11-26: Today list logic v2 (George approved all 7 ideas)
- Fresh share lowered to 20% overall and set by time of day: 25% before noon and 12 to 3, 20% from 3 to 6, 10% after 6 PM. Retries reach people far more often in the afternoon and evening (36% and 57% vs 13% and 14% for fresh), so evenings go mostly to retries and callbacks.
- Automatic same-day second try: a morning no-answer comes back next up after 3 PM without a re-sort.
- Fresh contacts ranked by George's own results (company, job, state booking rates). Switches on after 200 dialed contacts with at least 5 booked; until then import order is kept. The call screen shows "Good match" with the reason.
- Appointments: confirm the morning of (Confirm today / Confirmed pills and a Confirmed button), a Text reminder button that opens the phone's texting app with a ready message (sending through Quo comes later), and a warning when booking more than 2 days out.
- Quick qualifier tags on the call screen (Married, Kids, age range, Union, Has coverage, Homeowner), saved on the contact and in the CSV export.
- Reach by dial number chart (dials 1 to 10 shown separately, then 11+) next to the by-hour chart.
- Bad-number matching now compares digits, so formatting differences no longer hide a known bad number.

## 2026-11-26: Calendar and result forms (stage 5)
- Sale form matches the sheet's popup: Trial or Standard, ALP, monthly premium, whole life coverage, ADB (blank = none), optional email and notes. Same checks and the same dated note, shown as a preview before saving. A sale is dated at its appointment when that was in the last 7 days.
- No-sale form matches the sheet's: the 8 objections (pick any), what stopped it, optional follow-up date and notes. Follow-ups show on the calendar.
- Booking an appointment takes an optional email for the calendar invite. Calendar events use the sheet's title and details (30 min appointments, 10 min callbacks, "CALL BACK -" prefix).
- New Appointments page: the week at a glance (appointments with confirm status, callbacks, follow-ups, sold / presented / no-show), week stats (booked ahead, confirmed, show rate, sold), a details panel with Confirm, Text reminder, Sold, Presented, No-show, Move, and a "Needs a result" list (called into, past appointments with no result, appointments with no time).
- "Add to my calendar" downloads .ics files until Google Calendar is connected at go-live.
- Calendar sync rules ported from syncAppointments: match by phone, soonest upcoming time, never write back to a contact that is not Scheduled. Change: callback events are skipped (v27 reported them as "not tagged Scheduled").
- Database: migration 0002 adds the new sale, no-sale and contact fields and a calendar sync log.

## 2026-11-26: Results page (stage 6)
- One Results page replaces the Results, Sales, No Sales, Best Times and Daily Summary tabs, with subtabs: Overview, Sales, Presentations, When & where to dial, Daily history. Range switch: this month, last 30 days, all time.
- Overview: the 8 ratio tiles, funnel with the biggest drop, "What the numbers say", daily production, weekly conversion trend, last 7 days vs the 7 before, where the dials went, reach by dial number.
- Sales: latest sales table (all the Sales tab columns, CSV export), month ALP vs an editable monthly goal with pace marker, trial and standard ALP, biggest sales, where sales come from, cumulative ALP with a goal line, ALP by day, sales by weekday and time of day.
- Presentations: production funnel, presented vs sold by week, the objection donut, presentations this week, recent no-sales, follow-ups due.
- When & where to dial: reach rate, fresh vs retry, by dial number, weekday, hour and list, the weekday × hour heat map. Rows with fewer than 30 dials are grey so a lucky streak isn't read as a trend.
- Colors mean the same thing on every chart (dials blue, connects teal, scheduled violet, presented gold, sold green, trial orange, no-show red), with separate day and night shades. Hover or tap any bar or tile for its exact numbers.
- Demo: the build can load a read-only copy of an agent's sheet (scripts/real-seed.ts → realdata/, git-ignored, never committed). Demo data now saves in IndexedDB because a full sheet is too big for localStorage.

## 2026-11-26: Change a result from its card (George)
- Click any card on the Appointments week (sold, presented, no-show or follow-up, past or future) and use "Change this result": switch it to Sold, Presented not sold, No-show, or book it again, or edit the sale or no-sale details.
- The old record is taken out and the new one is saved on the same date, so the Sales list, Results and the Activity Log all read as if it had been entered right. The contact gets a dated "Result changed" note. Its tag only changes when that result is still the latest thing that happened. Undo puts it all back.
- Callback cards can now be marked Sold or Presented, or booked as an appointment, straight from the card.

## 2026-11-26: Clickable Results, follow-ups on Today (George)
- Every chart on Sales and Presentations opens the records behind it: bars (by day, weekday, time, cumulative, presentations this week, daily production), the objection donut and its table, the biggest-sales and source rows, the weekly presented-vs-sold rows, and the trial / standard tiles. A side sheet lists those sales and no-sales; open one to go to the dialer, call, edit it or change the result.
- Recent no-sales and Follow-ups due rows open the same way.
- Fixed ALP by day: the stacked bars had a gap between standard and trial (a style from the form buttons leaked into the chart).
- Today: a "Presented, not sold" contact with a follow-up date shows up as "Follow-up" on that day, right after callbacks, and stays (marked with its date) until it has been dialed. New Follow-ups filter tab. A follow-up call can set a callback.
| 2026-11-26 | Stage 7: roles. George is admin (everything, all agents), Austin and Gracie are agents (their own contacts), the boss sees the Team page only (results and totals, no contact details). Demo has a "Viewing as" switch in place of sign-in | Plan, George said go |
| 2026-11-26 | Team page: leaderboard by ALP, team totals, ALP by week and dials by day per agent, and each agent's health check and coaching note | Plan |
| 2026-11-26 | Settings (admin): each agent's goal, Quo switch and number, Monday note switch; the calling rules (was the Rules tab). Every save shows the list of changes first | Working rules (preview before saving) |
| 2026-11-26 | Daily health check: passed appointments with no result, do-not-call numbers on other contacts, late callbacks and follow-ups, duplicate and short numbers, sales with no email, contacts with no time zone. Shows only; changes nothing | Plan |
| 2026-11-26 | Quo built in for George and Gracie: Call dials through Quo, "Text with Quo" with a preview, call and text events from Quo saved on the contact. Never dispositions on its own | George |
| 2026-11-26 | Monday coaching note for every agent: last week against the week before, what went well, one thing to work on, best hour, goal pace. Preview now, emailed at go-live | George |
| 2026-11-26 | Monthly goal moved from each agent's Results page into Settings (still editable from Results) | So George can set everyone's |
| 2026-11-26 | Health check: "Look" items (like follow-ups that passed with no call) did nothing when clicked. Every item now opens its list, with "Open in dialer" on each row | George's bug report |
| 2026-11-26 | Call brief on the dialer for callbacks, follow-ups and no-shows only: who they are, where it stands, an opener, what to watch for. Rules-based in the demo; Claude writes it from the notes at go-live (falls back to the rules version) | George approved for those three |
| 2026-11-26 | Profile menu (top right): Settings, Integrations, monthly goal, keyboard shortcuts, export my contacts, night mode, reset demo, sign out. New Integrations page: Google sign-in, Calendar, Quo, Claude AI, Gmail, number finding | George |
