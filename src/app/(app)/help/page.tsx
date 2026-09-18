import type { Metadata } from 'next';
import Link from 'next/link';
import { Camera, CloudOff, Download, FolderTree, Lock, Mail, Search, Smartphone } from 'lucide-react';
import { brand } from '@/config/brand';
import { ButtonLink } from '@/components/ui/button';
import { requireOnboardedWorkspace } from '@/lib/session';

export const metadata: Metadata = { title: 'Help' };

const TOPICS = [
  {
    icon: Camera,
    title: 'Capturing a slip',
    body: 'Tap Scan, line the slip up inside the frame and take the photo. Crop and straighten pulls a skew photo square — drag the four corners onto the edges of the slip. Add more pages for a long till slip, then save.',
  },
  {
    icon: Search,
    title: 'When the details are wrong',
    body: 'Reading a crumpled slip is not perfect, which is why nothing is saved until you confirm it. Fields we were unsure about are marked “Please check”. Edit anything, any time, from the slip’s page.',
  },
  {
    icon: FolderTree,
    title: 'How filing works',
    body: 'Slips file themselves into a folder for the year and month of the purchase. You can add your own folders, move slips between them, and change the filing style in Business profile.',
  },
  {
    icon: Download,
    title: 'Sending slips to your accountant',
    body: 'Go to Exports and choose a folder, a date range, or everything. You get one ZIP: the original documents in year and month folders, plus a spreadsheet summary they can open straight away.',
  },
  {
    icon: CloudOff,
    title: 'Capturing without signal',
    body: 'Slips captured offline are saved on your device and upload automatically when you are back on a network. You will see “waiting to sync” until they are safely stored — and nothing gets uploaded twice.',
  },
  {
    icon: Smartphone,
    title: 'Adding Slipsy to your home screen',
    body: 'Open More → Add to Home Screen and follow the steps for your device. On an iPhone this is done through Safari’s Share menu. Once installed, Slipsy opens like any other app.',
  },
  {
    icon: Lock,
    title: 'Who can see your documents',
    body: 'Only you. Every slip belongs to your business workspace, files are stored privately, and the links that display them expire within minutes. No one from another business can reach your documents.',
  },
];

export default async function HelpPage() {
  await requireOnboardedWorkspace();

  return (
    <div className="app-container max-w-3xl py-6 lg:py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-forest-900 lg:text-3xl">Help</h1>
        <p className="mt-1 text-ink-600">Short answers to the things people ask most.</p>
      </header>

      <div className="space-y-3">
        {TOPICS.map((topic) => {
          const Icon = topic.icon;
          return (
            <section key={topic.title} className="rounded-xl border border-line bg-surface p-5 shadow-card">
              <h2 className="flex items-center gap-2.5 text-base font-bold text-forest-900">
                <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-mint-100 text-forest-700">
                  <Icon className="h-4.5 w-4.5" />
                </span>
                {topic.title}
              </h2>
              <p className="mt-2.5 text-sm leading-relaxed text-ink-600">{topic.body}</p>
            </section>
          );
        })}
      </div>

      <section className="mt-6 rounded-xl border border-mint-300 bg-mint-50 p-5">
        <h2 className="flex items-center gap-2 text-base font-bold text-forest-900">
          <Mail aria-hidden="true" className="h-4.5 w-4.5" />
          Still stuck?
        </h2>
        <p className="mt-2 text-sm text-forest-800/80">
          E-mail{' '}
          <a href={`mailto:${brand.supportEmail}`} className="rounded font-semibold underline underline-offset-2">
            {brand.supportEmail}
          </a>{' '}
          and tell us what happened. Include the date of the slip if it is about a specific one.
        </p>
        <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
          <ButtonLink href="/scan" size="sm">
            Scan a slip
          </ButtonLink>
          <Link
            href="/privacy"
            className="inline-flex h-10 items-center justify-center rounded-lg px-3.5 text-sm font-semibold text-forest-800 transition-colors hover:bg-mint-200 focus-visible:ring-2 focus-visible:ring-green-600"
          >
            Read the Privacy Policy
          </Link>
        </div>
      </section>
    </div>
  );
}
