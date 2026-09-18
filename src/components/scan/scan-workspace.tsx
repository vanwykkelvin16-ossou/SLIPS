'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, CheckCircle2, CloudOff, FileText, ImageUp, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProgressBar, StatusAnnouncer, SuccessCheck } from '@/components/ui/feedback';
import { ErrorState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { enqueueUpload, newUploadId } from '@/lib/client/upload-queue';
import { UPLOAD_ACCEPT_ATTRIBUTE } from '@/lib/storage/upload-constraints';
import { CameraCapture } from './camera-capture';
import { PageEditor } from './page-editor';

type Stage = 'choose' | 'camera' | 'edit' | 'pages' | 'uploading' | 'queued' | 'error';

interface CapturedPage {
  id: string;
  blob: Blob;
  name: string;
}

/** Reassuring, honest progress copy for each phase of the upload. */
const PROGRESS_STEPS = [
  'Uploading your slip…',
  'Reading the details…',
  'Checking the totals…',
  'Filing everything safely…',
] as const;

const MAX_PAGES = 10;

export function ScanWorkspace({ initialMode }: { initialMode: 'camera' | 'upload' }) {
  const router = useRouter();
  const { toast } = useToast();
  const { online } = useOnlineStatus();

  const [stage, setStage] = useState<Stage>(initialMode === 'camera' ? 'choose' : 'choose');
  const [pages, setPages] = useState<CapturedPage[]>([]);
  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null);
  const [progressStep, setProgressStep] = useState(0);
  const [progressValue, setProgressValue] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<XMLHttpRequest | null>(null);
  const startedFromUpload = useRef(initialMode === 'upload');

  useEffect(() => {
    if (startedFromUpload.current) {
      startedFromUpload.current = false;
      // Opening the picker immediately matches what the user asked for.
      setTimeout(() => fileInputRef.current?.click(), 120);
    }
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const addPage = useCallback((blob: Blob, name: string) => {
    setPages((current) => [...current, { id: newUploadId(), blob, name }]);
  }, []);

  function onFilesChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (chosen.length === 0) return;

    const pdf = chosen.find((file) => file.type === 'application/pdf');
    if (pdf) {
      // PDFs are uploaded as-is — they are already a document.
      setPages([{ id: newUploadId(), blob: pdf, name: pdf.name }]);
      setStage('pages');
      return;
    }

    const images = chosen.slice(0, MAX_PAGES - pages.length);
    if (images.length === 1 && pages.length === 0) {
      setPendingBlob(images[0]!);
      setStage('edit');
      return;
    }

    images.forEach((image, index) => addPage(image, image.name || `page-${pages.length + index + 1}.jpg`));
    setStage('pages');
  }

  function confirmEditedPage(edited: Blob) {
    addPage(edited, `page-${pages.length + 1}.jpg`);
    setPendingBlob(null);
    setStage('pages');
  }

  async function upload() {
    if (pages.length === 0) return;

    const uploadId = newUploadId();

    if (!online) {
      await queueForLater(uploadId);
      return;
    }

    setStage('uploading');
    setErrorMessage(null);
    setProgressStep(0);
    setProgressValue(0);

    const body = new FormData();
    body.set('clientUploadId', uploadId);
    pages.forEach((page, index) => {
      const extension = page.blob.type === 'application/pdf' ? 'pdf' : 'jpg';
      body.append('files', new File([page.blob], page.name || `page-${index + 1}.${extension}`, { type: page.blob.type || 'image/jpeg' }));
    });

    let receiptId: string;
    try {
      receiptId = await new Promise<string>((resolve, reject) => {
        const request = new XMLHttpRequest();
        abortRef.current = request;
        request.open('POST', '/api/receipts/upload');
        request.withCredentials = true;

        request.upload.onprogress = (event) => {
          if (!event.lengthComputable) return;
          setProgressValue(Math.round((event.loaded / event.total) * 55));
        };

        request.onload = () => {
          try {
            const payload = JSON.parse(request.responseText || '{}');
            if (request.status >= 200 && request.status < 300 && payload.receiptId) {
              resolve(payload.receiptId as string);
            } else {
              reject(new Error(payload.error ?? 'That upload did not go through.'));
            }
          } catch {
            reject(new Error('That upload did not go through.'));
          }
        };
        request.onerror = () => reject(new Error('offline'));
        request.onabort = () => reject(new Error('cancelled'));
        request.send(body);
      });
    } catch (error) {
      abortRef.current = null;
      const message = error instanceof Error ? error.message : 'That upload did not go through.';
      if (message === 'cancelled') {
        setStage('pages');
        return;
      }
      if (message === 'offline') {
        await queueForLater(uploadId);
        return;
      }
      setErrorMessage(message);
      setStage('error');
      return;
    }

    abortRef.current = null;
    setProgressStep(1);
    setProgressValue(65);

    try {
      const response = await fetch(`/api/receipts/${receiptId}/process`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });

      setProgressStep(2);
      setProgressValue(88);

      if (!response.ok && response.status !== 422) {
        // The document is stored; the user can still fill the details in.
        toast({
          title: 'Saved, but we could not read it',
          description: 'You can type the details in yourself on the next screen.',
          tone: 'warning',
        });
      }
    } catch {
      toast({
        title: 'Saved — reading will finish later',
        description: 'Your slip is stored safely. Add the details yourself if they are missing.',
        tone: 'warning',
      });
    }

    setProgressStep(3);
    setProgressValue(100);
    setSuccess(true);

    setTimeout(() => {
      router.replace(`/slips/${receiptId}/review`);
      router.refresh();
    }, 900);
  }

  async function queueForLater(uploadId: string) {
    try {
      await enqueueUpload(
        pages.map((page, index) => ({
          blob: page.blob,
          name: page.name || `page-${index + 1}.jpg`,
          type: page.blob.type || 'image/jpeg',
        })),
        uploadId,
      );
      window.dispatchEvent(new Event('slipsy:queued'));
      setStage('queued');
    } catch {
      setErrorMessage('We could not save that on this device. Try again once you are back online.');
      setStage('error');
    }
  }

  if (success) {
    return (
      <div role="status" className="flex flex-col items-center justify-center py-16 text-center">
        <SuccessCheck size={96} />
        <h2 className="mt-5 text-2xl font-extrabold tracking-tight text-forest-900">Everything is safely filed</h2>
        <p className="mt-2 text-ink-600">Taking you to check the details…</p>
      </div>
    );
  }

  if (stage === 'queued') {
    return (
      <div className="flex flex-col items-center justify-center py-14 text-center">
        <span aria-hidden="true" className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-warning-50 text-warning-600">
          <CloudOff className="h-7 w-7" />
        </span>
        <h2 className="text-xl font-bold text-forest-900">Saved on this device</h2>
        <p className="mt-2 max-w-sm text-balance text-ink-600">
          You are offline, so your slip is waiting safely on this device. It will upload by itself the moment you are back
          on a network — nothing will be duplicated.
        </p>
        <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
          <Button
            onClick={() => {
              setPages([]);
              setStage('choose');
            }}
            icon={<Camera className="h-4 w-4" />}
          >
            Capture another
          </Button>
          <Button variant="secondary" onClick={() => router.push('/dashboard')}>
            Back to dashboard
          </Button>
        </div>
      </div>
    );
  }

  if (stage === 'uploading') {
    return (
      <div className="py-10">
        <div className="mx-auto max-w-md text-center">
          <span aria-hidden="true" className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-mint-100 text-forest-700">
            <CheckCircle2 className="h-7 w-7 animate-pulse" />
          </span>
          <h2 className="text-xl font-bold text-forest-900">{PROGRESS_STEPS[progressStep]}</h2>
          <p className="mt-2 text-sm text-ink-500">
            {pages.length} page{pages.length === 1 ? '' : 's'} · this usually takes a few seconds
          </p>

          <ProgressBar className="mt-6" value={progressValue} label={PROGRESS_STEPS[progressStep] ?? 'Working'} />
          <StatusAnnouncer message={PROGRESS_STEPS[progressStep] ?? 'Working'} />

          <ol className="mt-6 space-y-2 text-left">
            {PROGRESS_STEPS.map((step, index) => (
              <li
                key={step}
                className={`flex items-center gap-2.5 text-sm ${index <= progressStep ? 'text-forest-800' : 'text-ink-400'}`}
              >
                <span
                  aria-hidden="true"
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                    index < progressStep
                      ? 'border-green-600 bg-green-600 text-white'
                      : index === progressStep
                        ? 'border-green-600'
                        : 'border-ink-300'
                  }`}
                >
                  {index < progressStep ? <CheckCircle2 className="h-3 w-3" /> : null}
                </span>
                {step}
              </li>
            ))}
          </ol>

          {progressStep === 0 ? (
            <Button
              variant="ghost"
              className="mt-6"
              onClick={() => {
                abortRef.current?.abort();
              }}
            >
              Cancel upload
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  if (stage === 'error') {
    return (
      <ErrorState
        title="That did not go through"
        description={errorMessage ?? 'Something interrupted the upload. Your pages are still here — try again.'}
        onRetry={() => {
          setErrorMessage(null);
          setStage('pages');
        }}
        retryLabel="Back to my pages"
      />
    );
  }

  if (stage === 'camera') {
    return (
      <CameraCapture
        pageNumber={pages.length + 1}
        onCapture={(blob) => {
          setPendingBlob(blob);
          setStage('edit');
        }}
        onUseUpload={() => fileInputRef.current?.click()}
      />
    );
  }

  if (stage === 'edit' && pendingBlob) {
    return (
      <PageEditor
        file={pendingBlob}
        pageNumber={pages.length + 1}
        onConfirm={confirmEditedPage}
        onRetake={() => {
          setPendingBlob(null);
          setStage(pages.length > 0 ? 'pages' : 'camera');
        }}
      />
    );
  }

  if (stage === 'pages' && pages.length > 0) {
    const isPdf = pages[0]?.blob.type === 'application/pdf';

    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-lg font-bold text-forest-900">
            {isPdf ? 'Ready to upload' : `${pages.length} page${pages.length === 1 ? '' : 's'} ready`}
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            {isPdf
              ? 'We will read the details out of your PDF once it is uploaded.'
              : 'Add more pages for a long slip, or upload what you have.'}
          </p>
        </div>

        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {pages.map((page, index) => (
            <li key={page.id} className="relative overflow-hidden rounded-lg border border-line bg-surface">
              {page.blob.type === 'application/pdf' ? (
                <span className="flex aspect-[3/4] flex-col items-center justify-center gap-2 bg-mint-50 p-3 text-center text-forest-700">
                  <FileText aria-hidden="true" className="h-8 w-8" />
                  <span className="line-clamp-2 break-all text-xs font-medium">{page.name}</span>
                </span>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={URL.createObjectURL(page.blob)}
                  alt={`Page ${index + 1}`}
                  className="aspect-[3/4] w-full object-cover"
                />
              )}
              <span className="absolute left-1.5 top-1.5 rounded-md bg-forest-900/80 px-1.5 py-0.5 text-2xs font-bold text-white">
                {index + 1}
              </span>
              <button
                type="button"
                onClick={() => setPages((current) => current.filter((item) => item.id !== page.id))}
                aria-label={`Remove page ${index + 1}`}
                className="absolute right-1.5 top-1.5 rounded-md bg-surface/95 p-1.5 text-ink-600 shadow-card transition-colors hover:bg-danger-50 hover:text-danger-600 focus-visible:ring-2 focus-visible:ring-green-600"
              >
                <X aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}

          {!isPdf && pages.length < MAX_PAGES ? (
            <li>
              <button
                type="button"
                onClick={() => setStage('camera')}
                className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-ink-300 bg-page text-ink-500 transition-colors hover:border-green-600 hover:bg-mint-50 hover:text-forest-700 focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2"
              >
                <Plus aria-hidden="true" className="h-6 w-6" />
                <span className="text-xs font-semibold">Add page</span>
              </button>
            </li>
          ) : null}
        </ul>

        {!online ? (
          <p className="flex items-start gap-2 rounded-lg border border-warning-500/40 bg-warning-50 px-4 py-3 text-sm font-medium text-warning-600">
            <CloudOff aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            You are offline. Saving now keeps the slip on this device and uploads it automatically later.
          </p>
        ) : null}

        <div className="flex flex-col gap-2.5 sm:flex-row">
          <Button
            variant="secondary"
            fullWidth
            onClick={() => {
              setPages([]);
              setStage('choose');
            }}
          >
            Start over
          </Button>
          <Button fullWidth size="lg" onClick={upload}>
            {online ? `Save ${pages.length === 1 ? 'this slip' : 'these pages'}` : 'Save on this device'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        accept={UPLOAD_ACCEPT_ATTRIBUTE}
        multiple
        onChange={onFilesChosen}
        className="sr-only"
        aria-label="Choose photos or a PDF to upload"
      />

      <button
        type="button"
        onClick={() => setStage('camera')}
        className="flex w-full items-center gap-4 rounded-xl border border-line bg-surface p-5 text-left shadow-card transition-all hover:-translate-y-0.5 hover:border-mint-300 hover:shadow-raised focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2"
      >
        <span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-green-600 text-white">
          <Camera className="h-6 w-6" />
        </span>
        <span className="min-w-0">
          <span className="block text-lg font-bold text-forest-900">Take a photo</span>
          <span className="block text-sm text-ink-500">Use your camera — the fastest way to capture a paper slip.</span>
        </span>
      </button>

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="flex w-full items-center gap-4 rounded-xl border border-line bg-surface p-5 text-left shadow-card transition-all hover:-translate-y-0.5 hover:border-mint-300 hover:shadow-raised focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2"
      >
        <span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-mint-100 text-forest-700">
          <ImageUp className="h-6 w-6" />
        </span>
        <span className="min-w-0">
          <span className="block text-lg font-bold text-forest-900">Upload from this device</span>
          <span className="block text-sm text-ink-500">A photo you already took, or a PDF invoice from your e-mail.</span>
        </span>
      </button>

      <p className="text-center text-sm text-ink-500">
        JPG, PNG, WebP, HEIC and PDF · up to 10 pages per slip
      </p>
    </div>
  );
}
