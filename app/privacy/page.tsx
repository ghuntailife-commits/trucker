import { LegalPage, BRAND, ADDRESS } from '../ui/legal';
export const metadata = { title: `Privacy Policy · ${BRAND}` };
export default function Privacy() {
  return <LegalPage title="Privacy Policy" updated="November 27, 2026">
    <p>This Privacy Policy explains how {BRAND} (&ldquo;we&rdquo;, &ldquo;us&rdquo;) collects and uses information when you speak with one of our licensed insurance agents by phone or receive text messages from us.</p>
    <h2>What we collect</h2>
    <ul>
      <li>Your name, phone number, email address, employer and the city and state you live in.</li>
      <li>Notes about your conversations with our agents, your appointment times and the coverage you ask about.</li>
      <li>Your choice to receive text messages, and when you made it.</li>
      <li>Recordings of phone calls, when you are told the call may be recorded.</li>
    </ul>
    <h2>How we use it</h2>
    <ul>
      <li>To schedule, confirm and remind you about appointments with your agent.</li>
      <li>To follow up about the benefits and insurance coverage you asked about.</li>
      <li>To keep accurate records and to train and coach our agents.</li>
    </ul>
    <h2>Text messages</h2>
    <p>We only text you after you agree to receive texts during a call with your agent. Messages are about your appointments and follow-ups. Message frequency varies. Message and data rates may apply. Reply <b>STOP</b> to stop receiving texts at any time, or <b>HELP</b> for help.</p>
    <p><b>We do not sell or share your SMS opt-in data or personal information with third parties for marketing purposes.</b> Text messaging originator opt-in data and consent will not be shared with any third parties, except the service providers who deliver our messages.</p>
    <h2>Who we share it with</h2>
    <p>We share information only with the service providers that run our phone, text and record-keeping systems, with the insurance company that issues any coverage you apply for, or when the law requires it. We never sell your information.</p>
    <h2>How we keep it safe</h2>
    <p>Your information is stored in secure systems that only our agents and administrators can sign in to, and each agent sees only their own clients.</p>
    <h2>Your choices</h2>
    <p>You can ask us to stop contacting you, to correct your information, or to delete it, by telling your agent, replying STOP to any text, or writing to us at {ADDRESS}.</p>
    <h2>Changes</h2>
    <p>If we change this policy, we will post the new version on this page with a new date.</p>
  </LegalPage>;
}
