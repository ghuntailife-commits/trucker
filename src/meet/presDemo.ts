// Made-up presentations for the demo's Coaching > Presentations tab. No real people.
import type { PresRow, PresTags } from './present';

const H = 3_600_000;
const tag = (t: Partial<PresTags>): PresTags => ({ kind: 'presentation', presOutcome: 'No sale', outcome: 'Presented', objections: [], whyNot: [], closeAsked: true, closeHow: '',
  products: [], wentWell: '', tryNext: '', exchanges: [], facts: [], ...t });

export function demoPresentations(agent: string, now: number): (PresRow & { agentId: string })[] {
  return [
    { id: 'demo-p1', agentId: agent, at: now - 26 * H, phone: '+15555550141', title: 'Presentation: Sam Testwell', doc: undefined,
      note: 'Sam (UPS driver, two kids) joined with his wife. Liked the no-cost AD&D and the cancer plan, worried about the monthly cost. Agreed to decide after payday; follow-up set for Friday 6 PM.',
      tags: tag({ presOutcome: 'Follow-up set', outcome: 'Callback set', objections: ['Money is tight', 'Need to talk to spouse'], closeHow: '"Which of these two options feels right for your family?" They chose to wait until payday.',
        whyNot: ['Price came before the value of the coverage was clear', 'Did not offer a smaller starter plan', 'Spouse had questions about the waiting period that were not answered'],
        products: ['Whole life', 'Cancer', 'AD&D no-cost'], wentWell: 'Brought the spouse in early and used the kids to make it real.', tryNext: 'When price comes up, show the smallest plan that still covers the mortgage before stepping back.',
        exchanges: [{ objection: 'Money is tight', contactSaid: "That's more than I was thinking, things are tight right now.", agentSaid: 'Totally fair. What would you be comfortable with each week?', result: 'unclear' }] }) },
    { id: 'demo-p2', agentId: agent, at: now - 3 * 24 * H, phone: '+15555550142', title: 'Presentation: Pat Example',
      note: 'Pat (USPS carrier) went through the union benefits and took the whole life plus accident plan.',
      tags: tag({ presOutcome: 'Sold', outcome: 'Sold', objections: ['Already has coverage'], closeHow: 'Assumed the sale: "Let\'s get your beneficiary set up."', products: ['Whole life', 'Accident'],
        wentWell: 'Compared the job coverage to what stays with them if they leave USPS.', tryNext: 'Ask for referrals right after the application, while they are excited.',
        exchanges: [{ objection: 'Already has coverage', contactSaid: 'I already have life insurance through work.', agentSaid: 'Great, does it go with you if you retire or change jobs?', result: 'saved' }] }) },
    { id: 'demo-p3', agentId: agent, at: now - 5 * 24 * H, phone: '+15555550143', title: 'Presentation: Lee Sample',
      note: 'Lee (rail conductor) was distracted and short on time. Heard the no-cost benefits but cut the presentation short. Said no to coverage.',
      tags: tag({ presOutcome: 'No sale', closeAsked: false, objections: ['Too busy / bad time', 'Not interested'], closeHow: 'Ran out of time before asking.',
        whyNot: ['Presentation started without confirming they had 30 minutes', 'Never asked for the sale', 'No follow-up time was set'], wentWell: 'Kept a calm, friendly tone when Lee got impatient.',
        tryNext: 'Confirm the time at the start, and reschedule rather than rush when they are distracted.' }) },
  ];
}
