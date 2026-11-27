import { LegalPage, BRAND } from '../ui/legal';
export const metadata = { title: `SMS Terms · ${BRAND}` };
export default function Terms() {
  return <LegalPage title="SMS Terms and Conditions" updated="November 27, 2026">
    <p><b>Program:</b> {BRAND} appointment texts. After you agree on a call with your licensed agent, you may receive texts confirming and reminding you about your appointment and following up afterward.</p>
    <p><b>Frequency:</b> message frequency varies, usually a few messages per appointment.</p>
    <p><b>Cost:</b> message and data rates may apply.</p>
    <p><b>Opt out:</b> reply <b>STOP</b> at any time to stop receiving texts. You will get one message confirming you have been unsubscribed.</p>
    <p><b>Help:</b> reply <b>HELP</b> for help, or ask your agent.</p>
    <p>Carriers are not liable for delayed or undelivered messages. See our <a href="/privacy">Privacy Policy</a>.</p>
  </LegalPage>;
}
