'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, ImageUp, SwitchCamera, Zap, ZapOff } from 'lucide-react';
import { Button, IconButton } from '@/components/ui/button';
import { LoadingState, PermissionDeniedState } from '@/components/ui/states';
import { canvasToBlob } from '@/lib/client/image-tools';

type CameraState = 'starting' | 'ready' | 'denied' | 'unavailable' | 'error';

/** `torch` is widely implemented on mobile but is not in the DOM typings. */
type TorchCapabilities = { torch?: boolean };
type TorchCapableTrack = Omit<MediaStreamTrack, 'getCapabilities'> & {
  getCapabilities?: () => TorchCapabilities;
};

/**
 * Live camera capture with a framing guide.
 * Every failure mode has a way forward — there is always an upload fallback.
 */
export function CameraCapture({
  onCapture,
  onUseUpload,
  pageNumber,
}: {
  onCapture: (blob: Blob) => void;
  onUseUpload: () => void;
  pageNumber: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CameraState>('starting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [capturing, setCapturing] = useState(false);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(
    async (mode: 'environment' | 'user') => {
      setState('starting');
      setErrorMessage(null);
      stop();

      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setState('unavailable');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: mode },
            width: { ideal: 1920 },
            height: { ideal: 1440 },
          },
          audio: false,
        });

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }

        const track = stream.getVideoTracks()[0] as TorchCapableTrack | undefined;
        setTorchSupported(Boolean(track?.getCapabilities?.().torch));
        setTorchOn(false);
        setState('ready');
      } catch (error) {
        const name = error instanceof Error ? error.name : '';
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          setState('denied');
        } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
          setState('unavailable');
        } else {
          setErrorMessage(error instanceof Error ? error.message : 'The camera could not be started.');
          setState('error');
        }
      }
    },
    [stop],
  );

  useEffect(() => {
    void start(facingMode);
    return stop;
  }, [facingMode, start, stop]);

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0] as TorchCapableTrack | undefined;
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn }] as unknown as MediaTrackConstraintSet[] });
      setTorchOn((current) => !current);
    } catch {
      setTorchSupported(false);
    }
  }

  async function capture() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;

    setCapturing(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.drawImage(video, 0, 0);
      onCapture(await canvasToBlob(canvas, 0.94));
    } finally {
      setCapturing(false);
    }
  }

  if (state === 'denied') {
    return (
      <PermissionDeniedState
        title="Camera access is blocked"
        description="Your browser is blocking the camera for this site. Allow camera access in your browser settings, or upload a photo from your device instead."
        onRetry={() => void start(facingMode)}
      />
    );
  }

  if (state === 'unavailable' || state === 'error') {
    return (
      <div role="alert" className="flex flex-col items-center px-6 py-12 text-center">
        <span aria-hidden="true" className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-ink-100 text-ink-500">
          <CameraOff className="h-7 w-7" />
        </span>
        <h3 className="text-lg font-bold text-forest-900">
          {state === 'unavailable' ? 'No camera on this device' : 'The camera would not start'}
        </h3>
        <p className="mt-2 max-w-sm text-balance text-sm text-ink-500">
          {errorMessage ?? 'You can still upload a photo or PDF you already have — nothing is lost.'}
        </p>
        <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
          <Button onClick={onUseUpload} icon={<ImageUp className="h-4 w-4" />}>
            Upload instead
          </Button>
          <Button variant="secondary" onClick={() => void start(facingMode)}>
            Try the camera again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-xl bg-forest-900">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          aria-label="Camera preview"
          className="aspect-[3/4] w-full object-cover sm:aspect-[4/3]"
        />

        {state === 'starting' ? (
          <div className="absolute inset-0 flex items-center justify-center bg-forest-900">
            <LoadingState message="Starting the camera…" className="text-white" />
          </div>
        ) : null}

        {/* Framing guide */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute inset-x-[8%] inset-y-[10%] rounded-lg border-2 border-dashed border-white/60">
            <span className="absolute -left-0.5 -top-0.5 h-7 w-7 rounded-tl-lg border-l-4 border-t-4 border-mint-300" />
            <span className="absolute -right-0.5 -top-0.5 h-7 w-7 rounded-tr-lg border-r-4 border-t-4 border-mint-300" />
            <span className="absolute -bottom-0.5 -left-0.5 h-7 w-7 rounded-bl-lg border-b-4 border-l-4 border-mint-300" />
            <span className="absolute -bottom-0.5 -right-0.5 h-7 w-7 rounded-br-lg border-b-4 border-r-4 border-mint-300" />
          </div>
        </div>

        <p className="absolute inset-x-0 bottom-3 text-center text-sm font-semibold text-white drop-shadow">
          {pageNumber > 1 ? `Page ${pageNumber} — line up the slip` : 'Line the slip up inside the frame'}
        </p>

        <div className="absolute right-3 top-3 flex flex-col gap-2">
          {torchSupported ? (
            <IconButton
              label={torchOn ? 'Turn the flash off' : 'Turn the flash on'}
              variant="secondary"
              icon={torchOn ? <ZapOff className="h-5 w-5" /> : <Zap className="h-5 w-5" />}
              onClick={toggleTorch}
            />
          ) : null}
          <IconButton
            label="Switch camera"
            variant="secondary"
            icon={<SwitchCamera className="h-5 w-5" />}
            onClick={() => setFacingMode((current) => (current === 'environment' ? 'user' : 'environment'))}
          />
        </div>
      </div>

      <div className="flex items-center justify-center gap-3">
        <Button variant="secondary" onClick={onUseUpload} icon={<ImageUp className="h-4 w-4" />}>
          Upload instead
        </Button>
        <Button
          size="lg"
          onClick={capture}
          disabled={state !== 'ready'}
          loading={capturing}
          loadingText="Capturing…"
          icon={<Camera className="h-5 w-5" />}
        >
          Take photo
        </Button>
      </div>
    </div>
  );
}
