import type { Metadata } from 'next';
import { brand } from '@/config/brand';

export const metadata: Metadata = {
  title: 'Terms of Use',
  description: `The agreement between you and ${brand.legalName} for using ${brand.name}.`,
};

const LAST_UPDATED = '18 September 2026';

export default function TermsPage() {
  return (
    <>
      <h1>Terms of Use</h1>
      <p className="text-ink-500">Last updated: {LAST_UPDATED}</p>

      <p>
        These terms are the agreement between you and {brand.legalName} for the use of {brand.name}. By creating an
        account you accept them. If you are agreeing on behalf of a business, you confirm you are allowed to do so.
      </p>

      <h2>1. What {brand.name} does</h2>
      <p>
        {brand.name} lets you capture receipts, slips and invoices, reads suggested details from them, organises them
        into folders and lets you export them. It is a record-keeping tool. It is not an accountant, a bookkeeper, or
        tax advice, and it does not file anything with a revenue authority on your behalf.
      </p>

      <h2>2. Your account</h2>
      <ul>
        <li>You must give accurate details when you sign up and keep them up to date.</li>
        <li>You are responsible for keeping your password to yourself and for activity under your account.</li>
        <li>Tell us promptly at <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a> if you believe someone else has access.</li>
        <li>One workspace belongs to one business. Do not attempt to reach another business’s workspace or documents.</li>
      </ul>

      <h2>3. Your documents stay yours</h2>
      <p>
        You keep ownership of everything you upload. You grant us only the permission needed to run the service for you:
        to store your documents, generate previews, extract details, and produce the exports you ask for. We do not claim
        any other right to your content, and we do not use it to train models of our own.
      </p>

      <h2>4. Accuracy of extracted details</h2>
      <p>
        Details read from a document are a suggestion, not a fact. Photographs of paper slips are often faint, creased or
        partly missing, and extraction can be wrong. Every field is shown to you for confirmation before anything is
        filed, and you can edit it afterwards.
      </p>
      <p>
        <strong>You are responsible for checking that the information you save is correct</strong>, particularly amounts,
        dates and VAT, and for meeting your own record-keeping and tax obligations. Keep your original paper documents
        for as long as the law requires you to.
      </p>

      <h2>5. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Upload anything unlawful, or anything you do not have the right to store.</li>
        <li>Upload malware, or attempt to disrupt, overload or probe the service for weaknesses without our written permission.</li>
        <li>Attempt to access another business’s data, or to bypass authentication, rate limits or usage limits.</li>
        <li>Resell or redistribute the service without our agreement.</li>
      </ul>
      <p>We may suspend an account that is being used in these ways, and will tell you why where we lawfully can.</p>

      <h2>6. Availability</h2>
      <p>
        We work to keep {brand.name} available and your documents safe, but no online service is perfect. Access may be
        interrupted for maintenance, updates or events outside our control. Keep your own copies of anything you cannot
        afford to lose — the export tools exist so you always can.
      </p>

      <h2>7. Fees</h2>
      <p>
        Where a paid plan applies, its price, billing period and cancellation terms are shown before you subscribe. If no
        paid plan has been presented to you, your use is free of charge and we may introduce paid plans in future with
        reasonable notice.
      </p>

      <h2>8. Ending this agreement</h2>
      <p>
        You may stop using {brand.name} at any time and delete your account from Settings, which destroys your workspace
        and documents. We may end this agreement if you breach these terms, or with reasonable notice if we discontinue
        the service — in which case you will have a fair opportunity to export your documents first.
      </p>

      <h2>9. Liability</h2>
      <p>
        Nothing in these terms limits liability that cannot lawfully be limited, including for fraud, or for rights you
        have under the Consumer Protection Act where it applies to you. Subject to that, {brand.legalName} is not liable
        for indirect or consequential loss, loss of profit, or loss arising from your reliance on extracted details you
        did not check. Our total liability in connection with the service is limited to the fees you paid us in the
        twelve months before the claim.
      </p>

      <h2>10. Changes to these terms</h2>
      <p>
        If we change these terms in a way that materially affects you, we will tell you in the app before the change
        takes effect. Continuing to use {brand.name} after that means you accept the updated terms.
      </p>

      <h2>11. Governing law</h2>
      <p>
        These terms are governed by the laws of the Republic of South Africa, and the courts of South Africa have
        jurisdiction over any dispute arising from them.
      </p>

      <h2>12. Contact</h2>
      <p>
        Questions about these terms: <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>.
      </p>
    </>
  );
}
