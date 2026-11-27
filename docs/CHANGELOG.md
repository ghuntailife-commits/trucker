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
| 2026-11-26 | Boss can no longer read the note text on sales and no-sales; Team page gets amounts and objections through two totals-only functions (migration 0004) | George asked that agents see only their own data |
| 2026-11-26 | Number sheet: each agent gets their own new Google Sheet for finding numbers. On Needs Number, tick contacts and Send to number sheet (preview first). Every 2 minutes the app reads the sheet: numbers that pass the usual checks (10 digits, not marked bad, not on another contact, name matches the Contact ID) are saved to the contact; the rest stay on the sheet with the reason and show as Needs a look. Status is written back on the sheet, Cannot find works from the sheet, each upload can be undone, and an optional switch sends new bad numbers automatically. Demo uses a pretend sheet; migration 0005 and src/numbers/google.ts for go-live | George |
| 2026-11-26 | Number sheet now laid out exactly like the Needs Number tab on George Truckers: banner, NEEDS A NUMBER on the left and NEEDS A NEW NUMBER on the right, same columns (LinkedIn, Tab, Row, Old Number, Notes), same widths, yellow type-here columns. Contact IDs and the app's status sit in hidden columns; saved rows turn green, rows that need a look red (reason in a note), done rows grey. "Cannot find" in Finder Notes marks Cannot Find | George |
| 2026-11-26 | Time zone filled in automatically: from the city and state (cities on the other side of the line in split states like Tennessee, Kentucky, Florida, Indiana, Texas), else from the phone's area code. Applied on import, when a number is found, when moving from the sheet, and to every current contact with a blank zone (7,148 of George's) | George |
| 2026-11-26 | Calling hours: a contact is on Today only between 8 AM and 9 PM in their own time zone, so after 9 PM Eastern the list fills with Central, Mountain and Pacific contacts where it's earlier. Arizona has no daylight saving | George |
| 2026-11-26 | Appointments: sold, presented and no-show cards sit at the time the appointment was booked for (read from the notes), not the moment the result was entered (a no-show entered two days late showed at the entry time) | George's report |
| 2026-11-26 | The app is now Dispatch: George's logos (day and night versions switch with night mode), browser tab icon, app icons and web-app manifest in public/ | George |
| 2026-11-26 | Sidebar menu on the left with an icon for each page (Home house, Today sun, Appointments calendar, Contacts contact book, Needs Number #, Results bar chart, Team people). Folds down to icons and remembers it; on a phone it slides in from the menu button. Badges: left to dial, results to enter, sheet rows that need a look | George |
| 2026-11-26 | Home screen (the logo goes there, and the app opens on it): daily note on the month's production against goal, what it takes a day, today so far, appointments left, what's waiting and the week against last week; month pace chart; cards for Today, appointments today, waiting callbacks/follow-ups/no-shows/new numbers, this week's coaching focus, recent sales, health check and numbers | George |
| 2026-11-26 | Home: goal bar split into standard (green) and trial (yellow); month chart rebuilt as stacked standard and trial ALP against an even pace to goal, with a y-axis, the goal label inside the chart, and a hover/tap tooltip for each day; daily note adds the standard/trial split, sales needed at your average sale, last month at this point, and who to call first; appointments card shows the next day's bookings when today's are done | George |
| 2026-11-26 | Contact library (admin page, was the Lead Library sheet): filter by state and given/not given, pick contacts or the first N, pick the agent, review (licensed states, already given, duplicates and Do Not Call skipped), send, undo. Counts per state and per person. Demo uses made-up library contacts; migration 0006 | George |
| 2026-11-26 | Profile menu: My licensed states, set by each agent; the library only sends contacts in those states | George |
| 2026-11-26 | Results, Sales: Add a sale for company leads, referrals and other sources. Counts toward ALP and goal, not close rate; shows its source on the sales list | George |
| 2026-11-26 | Follow-ups after a presentation: the dialer shows only Sale, Still no sale and No answer (keys 1-3). A no-answer brings it back the next day; after 3 no-answer calls it drops off Today | George |
| 2026-11-26 | The top bar no longer repeats the page title | George |
| 2026-11-26 | Page name back in the top bar (smaller); the big heading under it is gone | George |
| 2026-11-26 | Results, Daily history: fixed the table being pushed left (dates cut off, Imported column out of view); all columns fit, the day stays in view when scrolling sideways, and days with sales but no dials are no longer greyed | George |
| 2026-11-27 | Whole team on Dispatch: all 20 people from the Truckers Registry, new "team lead" role (Braga, Bradley) who see only their own people on Team, "Under" setting, Team page filter by team. Contact library stays admin-only. |
| 2026-11-27 | Go-live wiring: sign-in (Google or emailed link), data saved to the live database in parts (one per list, one per month of activity), team leads read their team only, admin-only switch-over that reads every agent's sheet once (read only) with times to the second, previews counts, saves on Confirm and checks counts after. Database file: supabase/live.sql. |
| 2026-11-27 | Home chart drawn at true size. Agents' licensed states save live. Quo live: texts send through the server (/api/quo/send), webhook (/api/quo/webhook) stores calls, texts, recordings, transcripts and Quo summaries; Claude writes short call notes from transcripts; events land on the contact's notes. Database file: supabase/live-quo.sql. |
| 2026-11-26 | Sort any table by clicking its column headers (Today, Contacts, Needs Number, Contact library, Results, Team). Needs Number opens "best first": licensed states, people talked to before, companies that bought, easy to find, mixed across companies. |
| 2026-11-26 | Needs Number best-first: score tiers with companies taking turns inside a tier (no strong contact drops below a weaker one), better employer matching, lists that pick up and states with presentations count. |
| 2026-11-26 | Coaching tab (agents with Quo, George sees all): Claude tags each transcribed call (outcome, objections, went well, try next); objections and outcomes, a weekly note from Claude, every call with its recording. Needs `ai_tags` column (supabase/live-quo.sql). |
| 2026-11-26 | Contact library: drag contacts onto an agent card to send (review first); Import CSV (any column order, preview first); "Bring over Lead Library" reads the sheet once, read only, leaving out contacts already given out, with no state, or already known. |
| 2026-11-26 | Needs Number: search box, Show 100/500/1,000/All, Export CSV (ticked, or everyone shown), Import numbers (fills the boxes by Dispatch ID or name for review and save). Visible scrollbars and Show picker on long lists (Contacts, Contact library). |
| 2026-11-26 | Home note redesign: theme of the day (weekday themes, holidays), quote of the day by theme (perseverance, wisdom, patience, chasing success, positive mindset), headline number, and tiles instead of sentences. |
| 2026-11-26 | Contact library: State column and state picker; Lead Library button asks Google for spreadsheet access itself and resumes. One agent per contact: a send checks every other agent's contacts (phone or name + company); an uncalled copy is taken off the other agent's list, one they are already working is skipped. Library imports skip anyone already on any agent's list. |
| 2026-11-26 | Today dialer: three more results, Hung up (7), Called into (8) and Do not call (9). |
| 2026-11-26 | Home: Morning Wisdom replaces the quote of the day. 125 entries in 12 themes, each with source (translator named; King James for scripture), what it means, a reflection and today's intention. Sources, distribution and left-out quotes in docs/morning-wisdom-sources.md. Mobile tiles fix. |
| 2026-11-26 | Shift-click to pick a range (Contact library, Needs Number, Move between agents). Contact library: "Move between agents" opens any agent's contacts (search, state), tick or shift-click a range, pick who gets them, review (licensed states, duplicates), move. History and tags go with the contact, with a "Moved from" note. |
| 2026-11-26 | Home tiles (To goal, Today, Appointments, This week…) open their page. Morning Wisdom: 18 more Simon Arias entries from his GRINDcast talks (149 in all). |
| 2026-11-26 | Admin "View as" picker in the top bar: open any agent's Dispatch as they see it, with a banner and Back to mine. |
| 2026-11-27 | Google Calendar: Connect on Appointments. Appointments and callbacks go on the agent's own Google Calendar (contact invited when there is an email), kept up to date every few minutes; moving one in Google moves it in Dispatch with a note. Needs supabase/live-calendar.sql and GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in Vercel. |
| 2026-11-26 | Appointments as a real calendar: hours down the side, every appointment a 30-minute block, open time shows as empty space ("Open · 2:30 PM" on hover), drag appointments and callbacks to a new half hour (List view still there). Call and Text buttons on every client panel (Appointments, Contacts, Results); Text uses Quo when it is on. |
| 2026-11-26 | Appointments: + New event (or click open time on the calendar) to book a contact's appointment or callback at that time, or add your own event (lunch, meeting) with a length. Own events show as busy time, drag to move, edit or delete from the side panel. |
| 2026-11-26 | Calendar delete: right-click any block for a menu (Call, Text, Mark confirmed, Move, Open in dialer, Cancel appointment / Remove callback, or Edit / Delete for your own events); Delete or Backspace removes the picked block; Cancel link in the side panel. Cancelled contacts go back in the calling list with a note; Undo works. Coaching groundwork: calls now record opener, how far the call got, and each objection with the agent's answer and whether it saved the call. |
| 2026-11-26 | Coaching: Team Playbook tab (everyone): objections with the rebuttals that save calls (Dispatch counts tries and saves), what contacts say, openers, tips, trends and what the coach learned. Learns every morning at 6 AM ET from the team's transcribed calls (vercel.json cron), George can press Learn now. Ask the coach chat for every agent. Teach the coach (George only): paste scripts and notes the coach weighs against real calls. |
| 2026-11-26 | Agent control over Today: right-click a contact (or the ⋯ at the end of the row, or More by Skip) to Call next, Add to Today, Replace (off Today today, the next contact fills the spot), Pause until resumed, Rest 75 days, or Remove from my contacts (goes back to the contact library with notes and history, picked up when George opens the library). Contacts: same menu on right-click, Call next / Pause / Rest buttons, a Paused · resting group with Resume. My Today settings: how many contacts, fresh/retry mix, which lists. |
| 2026-11-27 | Calendar: drag the bottom edge of your own events to make them longer or shorter; New event warns when the time overlaps an appointment, callback or your own event (or has passed). |
| 2026-11-27 | Today is always built: contacts outside their calling hours (before 8 AM / after 9 PM their time) stay on the list, greyed and at the bottom, with a note on the dialer, instead of the list going empty at night | George |
| 2026-11-27 | Calendar: own events can repeat (every day, every weekday, every week); drag or stretch one to change just that one; delete this one or all repeats | George |
| 2026-11-27 | Calendar: working hours per agent (greyed outside them) and a "Next 3 openings" button with a line to read out or text | George |
| 2026-11-27 | Call brief shows the AI notes from the last call and "What we know": facts Claude gleans from each transcript (still with the company or left, job, hours, best time, family, what they had going on that day, coverage, who decides, personal). Shows for any contact with a past call, not only callbacks, follow-ups and no-shows. Older calls are re-read once in the background | George |
| 2026-11-27 | Claude writes the call brief in its own words (from the notes, last call and What we know); the rules draft shows until it arrives and if the AI is off. The next contact's brief is written ahead | George |
| 2026-11-27 | Booked appointments and callbacks carry prep notes: a Prep box on Appointments (Claude's brief, last call, What we know), and the same notes on the calendar event. Never on an invite the client receives | George |
| 2026-11-27 | Quo works for an agent with their own Quo account (Gracie): per-agent keys QUO_API_KEY_<ID> and QUO_SIGNING_KEY_<ID> on Vercel; their calls, texts, recordings and AI notes land in their Dispatch | George |
| 2026-11-27 | Settings: sign-in email per agent (iCloud, Outlook, Gmail), with a confirm before saving | George |
| 2026-11-27 | Dialer: click the green call button (or C / Enter) to end the call and pick the result; the timer also stops by itself when Quo reports the call ended | George |
| 2026-11-27 | Fix: AI call notes failed since the coaching tags were added (Opus 5.5 refuses a forced tool choice). Now asks with tool choice auto; missed calls get their notes on the next Dispatch open | Bug |
| 2026-11-27 | Each agent picks their own time zone (profile menu); all their times and day boundaries follow it, saved with their account | George |
| 2026-11-27 | Dialer: Call backup / Call main button dials the other number right away (ends the current call timer) | George |
| 2026-11-27 | Appointments calendar shows the agent's own Google Calendar events as busy time (read only), and openings and double-booking warnings count them | George |
| 2026-11-27 | Google Calendar: the agent's own events (lunch, meetings, repeats over the next five weeks) go to Google too, not only appointments and callbacks | George |
| 2026-11-27 | Needs Number: new Find today tab. Tick contacts, Add to Find today, then send just that list to the number sheet | George |
| 2026-11-27 | Wide, clickable scrollbars on the long tables and lists (Needs Number, Contacts, Today, library, calendar) | George |
| 2026-11-27 | Google Calendar: Dispatch takes over the events your old sheet already made (same person, same time) and removes its own extra copies, so nothing shows twice | George |
| 2026-11-27 | Admin only: Search every agent. All agents button (or the search box's last row) looks through every agent's contacts; click one to open that agent's Dispatch on the contact | George |
| 2026-11-27 | Today: a number found for someone never dialed shows as Fresh, not New number | George |
| 2026-11-27 | Contacts the admin imports for another agent also go to that agent's inbox, so the agent's open Dispatch can't wipe them; Dispatch checks the inbox every minute, on focus and on Re-sort | George |
| 2026-11-27 | Admin on another agent's Dispatch: every change (add, import, edit, remove, notes, results) goes through the agent's inbox and shows on their open screen within a minute; nobody saves over anyone | George |
| 2026-11-27 | Admin imports now also skip anyone already on another agent's Dispatch (by phone, backup or name + company) and say whose list they're on | George |
| 2026-11-27 | Admin: tick contacts on the Contacts tab (shift-click for a range) and Move them to another agent, with the same review as the library's move | George |
| 2026-11-27 | Saving never wipes someone else's changes: if another screen changed a contact list since this one last saved, the two are merged contact by contact. Open screens on an old version reload themselves between calls | George |
| 2026-11-27 | System status page (admin, profile menu): per agent saving, open screens and versions, waiting changes, Quo events, AI notes, Google Calendar sync; red/amber/green; refreshes every minute | George |
| 2026-11-27 | A follow-up call (still no sale, or sold on the follow-up) no longer counts as a new presentation, unless they were booked again; follow-up no-sales show as Follow-up on Today | George |
| 2026-11-27 | More no-sale reasons: Uninsurable (health), Not eligible, No bank account / payment method, Lost job / income change, Wants to shop around, Bad past experience, Not interested | George |
| 2026-11-27 | Home: clicking an appointment opens its card on the Appointments page (Sold / Presented / No-show / Move), not the dialer | George |
| 2026-11-27 | Local match for calls: when an agent has several Quo numbers, the Call button says which line is closest to the contact (same state, then time zone, then main). Texts stay on the main number (Quo plan limit). |
| 2026-11-27 | Presentation coaching from Google Meet: transcripts on calendar events are matched to the contact and read by Claude (outcome, objections and answers, the close, why it didn't close). Coaching > Presentations, contact notes, weekly note, Ask the coach and the Playbook. |
| 2026-11-27 | Meet presentations: the first check reads the last year of transcripts; recordings that match no contact are listed to pick a contact or skip; "Wrong contact?" moves a presentation; Coaching gets a Last year range. |
| 2026-11-27 | Home: Recent feed ("11 new contacts delivered!", appointments booked, sales). Contacts: Assigned column (date a contact arrived on that Dispatch), sortable. |
| 2026-11-27 | Meet presentations: reads every calendar the agent can edit (Gracie's APPOINTMENTS calendar), not just the main one. Needs the calendar.calendarlist.readonly permission. |
| 2026-11-27 | Team feed: leads assigned, sales with ALP, presentations with the no-sale reason and bookings, posted by each agent's screen (kv dispatch-team-feed via /api/feed). Sage-green notes bottom left; yours say You / For you. Home Recent shows the whole team. Needs Number: Assigned column, sortable. |
