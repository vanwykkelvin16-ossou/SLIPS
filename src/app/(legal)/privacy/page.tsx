import type { Metadata } from 'next';
import { brand } from '@/config/brand';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: `How ${brand.name} handles the documents and personal information you trust it with.`,
};

const LAST_UPDATED = '18 September 2026';

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="text-ink-500">Last updated: {LAST_UPDATED}</p>

      <p>
        {brand.name} exists to keep your business receipts organised. Those documents contain financial information about
        your business, so this policy explains plainly what we collect, why, where it is stored and what control you have
        over it.
      </p>

      <h2>Who is responsible for your information</h2>
      <p>
        {brand.legalName} operates {brand.name} and is the responsible party for the personal information processed
        through it. You can reach us at <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>.
      </p>

      <h2>What we collect</h2>
      <h3>Information you give us</h3>
      <ul>
        <li>Your first name, and last name if you add one.</li>
        <li>Your business name, and optionally a business telephone number, VAT number and address.</li>
        <li>Your e-mail address and telephone number.</li>
        <li>A password, which is stored only as a salted bcrypt hash — never as text we can read.</li>
        <li>The receipts, slips and invoices you upload, and any notes, tags or corrections you add to them.</li>
      </ul>

      <h3>Information created when you use {brand.name}</h3>
      <ul>
        <li>Details extracted from your documents, such as merchant, date, VAT and total.</li>
        <li>Thumbnails and screen-sized previews generated from your uploads, so lists load quickly.</li>
        <li>
          An activity log of important document actions — who uploaded, changed, downloaded, exported or deleted what,
          and when. This log records the type of action, not the contents of your documents or their amounts.
        </li>
        <li>
          A one-way keyed hash of your IP address and your browser’s user-agent string, used to rate-limit abuse and to
          investigate suspicious sign-in activity. We do not store your raw IP address in that log.
        </li>
      </ul>

      <h2>Why we process it</h2>
      <ul>
        <li>
          <strong>To provide the service you asked for</strong> — storing, reading, organising, searching and exporting
          your slips.
        </li>
        <li>
          <strong>To keep your account secure</strong> — signing you in, confirming your e-mail address, resetting
          passwords, limiting repeated failed attempts, and keeping the audit trail.
        </li>
        <li>
          <strong>To contact you about your account</strong> — e-mail confirmations, password changes, and export
          notifications you can switch off in Settings.
        </li>
      </ul>
      <p>
        We do not sell your information, we do not share your documents with other businesses, and we do not use your
        receipts to build advertising profiles.
      </p>

      <h2>Where your documents are stored</h2>
      <p>
        Uploaded files are written to private storage that is not publicly reachable. Filenames are replaced with random
        identifiers, so nothing about a document can be guessed from its storage location. A document is only ever served
        to a signed-in session that belongs to the same business workspace, through a link that expires within minutes.
      </p>
      <p>
        Traffic between your device and {brand.name} is encrypted in transit. Where the storage provider supports
        encryption at rest, it is enabled.
      </p>

      <h2>Reading your documents</h2>
      <p>
        To suggest a merchant, date and total, the contents of an uploaded document are processed by a
        document-understanding service. Which service depends on how this installation is configured: the default engine
        runs on our own servers and sends nothing to a third party. If a cloud provider is configured instead, your
        document is transmitted to that provider for processing only, and is not used by them to train models under the
        terms we require.
      </p>
      <p>
        Extraction is a suggestion, never a decision. Nothing is filed until you confirm or correct it, and no automated
        decision with legal or similarly significant effects is made about you.
      </p>

      <h2>Who else is involved</h2>
      <p>To run the service we rely on a small number of operators, each handling only what their job requires:</p>
      <ul>
        <li>A hosting provider that runs the application.</li>
        <li>A database provider that stores your account and receipt records.</li>
        <li>An object storage provider that holds your uploaded documents.</li>
        <li>A document-understanding provider, where one is configured.</li>
        <li>An e-mail provider that delivers account e-mails.</li>
      </ul>
      <p>
        These operators act on our instructions and may not use your information for their own purposes. The specific
        providers in use for your installation are listed in the deployment documentation and can be confirmed on
        request.
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li>Your documents and their details are kept until you delete them or close your account.</li>
        <li>Deleted slips are hidden immediately and can be restored by you.</li>
        <li>Export archives are deleted automatically after their retention window (72 hours by default).</li>
        <li>Password reset links expire after one hour; e-mail confirmation links after 24 hours.</li>
        <li>
          When you delete your account, your workspace, documents, folders and exports are destroyed. Audit entries that
          record the deletion itself are retained without identifying you, because a record that something was deleted is
          what makes the log trustworthy.
        </li>
      </ul>

      <h2>Your choices and rights</h2>
      <ul>
        <li>
          <strong>See and correct it.</strong> Every field on every slip is editable, and your own details live in
          Settings.
        </li>
        <li>
          <strong>Take it with you.</strong> Settings → Your data downloads a complete JSON record of your account, and
          Exports packages your original documents as a ZIP.
        </li>
        <li>
          <strong>Delete it.</strong> Delete individual slips at any time, or delete your entire account from Settings.
        </li>
        <li>
          <strong>Stop the e-mails.</strong> Notification preferences are in Settings. Security e-mails, such as a
          password-change alert, cannot be switched off.
        </li>
      </ul>
      <p>
        These controls were built with the principles of South Africa’s Protection of Personal Information Act in mind —
        minimising what is collected, limiting who can reach it, keeping it accurate, and letting you take it back or
        remove it. That design intent is not a claim of certification by any authority. If you believe your information
        has been mishandled, write to us first at{' '}
        <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>; you also have the right to complain to the
        Information Regulator of South Africa.
      </p>

      <h2>Children</h2>
      <p>{brand.name} is a tool for businesses and is not intended for use by anyone under 18.</p>

      <h2>Changes to this policy</h2>
      <p>
        If this policy changes in a way that affects you, we will update the date at the top and tell you inside the app
        before the change takes effect.
      </p>
    </>
  );
}
