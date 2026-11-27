import { LegalPage, BRAND } from '../ui/legal';
export const metadata = { title: `Text Consent Script · ${BRAND}` };
export default function Consent() {
  return <LegalPage title="Verbal Text Consent Script" updated="November 27, 2026">
    <p>Our licensed agents use this script on the phone before sending any text. No texts are sent to anyone who has not said yes.</p>
    <h2>Script</h2>
    <blockquote>&ldquo;Would it be okay if I text you at this number to confirm our appointment and send you a reminder before it? Message and data rates may apply, and you can reply STOP at any time to opt out.&rdquo;</blockquote>
    <p>The agent sends texts only if the person clearly says yes. The agent records the consent and the date in the client&rsquo;s file.</p>
    <h2>First message</h2>
    <blockquote>&ldquo;Hi Jordan, this is George with {BRAND}. You&rsquo;re all set for Tuesday, 12/1 at 7:00 PM ET. I&rsquo;ll call you at this number. Reply STOP to opt out.&rdquo;</blockquote>
    <p>Replies of STOP, UNSUBSCRIBE, CANCEL, END or QUIT stop all texts. HELP returns help information. See our <a href="/terms">SMS Terms</a> and <a href="/privacy">Privacy Policy</a>.</p>
  </LegalPage>;
}
