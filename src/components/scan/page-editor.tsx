'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Crop, RotateCcw, RotateCw, Sparkles, Trash2, TriangleAlert, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  BLUR_WARNING_THRESHOLD,
  estimateSharpness,
  loadImage,
  renderEditedImage,
  type Point,
  type Quad,
} from '@/lib/client/image-tools';

const DEFAULT_QUAD: Quad = [
  { x: 0.06, y: 0.05 },
  { x: 0.94, y: 0.05 },
  { x: 0.94, y: 0.95 },
  { x: 0.06, y: 0.95 },
];

const HANDLE_LABELS = ['Top left', 'Top right', 'Bottom right', 'Bottom left'];

/**
 * Preview and clean up one captured page before it is uploaded.
 *
 * Crop corners can be dragged individually, so a slip photographed at an angle
 * is flattened by a real perspective correction rather than a straight crop.
 */
export function PageEditor({
  file,
  pageNumber,
  onConfirm,
  onRetake,
  onRemove,
  confirmLabel = 'Use this page',
  busy = false,
}: {
  file: Blob;
  pageNumber: number;
  onConfirm: (edited: Blob) => void;
  onRetake: () => void;
  onRemove?: () => void;
  confirmLabel?: string;
  busy?: boolean;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [rotation, setRotation] = useState(0);
  const [quad, setQuad] = useState<Quad>(DEFAULT_QUAD);
  const [cropEnabled, setCropEnabled] = useState(false);
  const [enhance, setEnhance] = useState(false);
  const [sharpness, setSharpness] = useState<number | null>(null);
  const [applying, setApplying] = useState(false);
  const [activeHandle, setActiveHandle] = useState<number | null>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    setRotation(0);
    setQuad(DEFAULT_QUAD);
    setCropEnabled(false);
    setEnhance(false);

    void loadImage(file).then((image) => setDimensions({ width: image.naturalWidth, height: image.naturalHeight }));
    void estimateSharpness(file).then(setSharpness);

    return () => URL.revokeObjectURL(url);
  }, [file]);

  const blurry = sharpness !== null && sharpness < BLUR_WARNING_THRESHOLD;

  const moveHandle = useCallback((index: number, clientX: number, clientY: number) => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const rect = surface.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    setQuad((current) => {
      const next = [...current] as Quad;
      next[index] = { x, y };
      return next;
    });
  }, []);

  const onHandleKeyDown = useCallback(
    (index: number, event: React.KeyboardEvent) => {
      const step = event.shiftKey ? 0.05 : 0.01;
      const deltas: Record<string, Point> = {
        ArrowLeft: { x: -step, y: 0 },
        ArrowRight: { x: step, y: 0 },
        ArrowUp: { x: 0, y: -step },
        ArrowDown: { x: 0, y: step },
      };
      const delta = deltas[event.key];
      if (!delta) return;
      event.preventDefault();
      setQuad((current) => {
        const next = [...current] as Quad;
        const point = next[index]!;
        next[index] = {
          x: Math.min(1, Math.max(0, point.x + delta.x)),
          y: Math.min(1, Math.max(0, point.y + delta.y)),
        };
        return next;
      });
    },
    [],
  );

  const polygon = useMemo(
    () => quad.map((point) => `${(point.x * 100).toFixed(2)}% ${(point.y * 100).toFixed(2)}%`).join(', '),
    [quad],
  );

  async function apply() {
    setApplying(true);
    try {
      const pixelQuad: Quad | null =
        cropEnabled && dimensions
          ? (quad.map((point) => ({ x: point.x * dimensions.width, y: point.y * dimensions.height })) as Quad)
          : null;

      const edited = await renderEditedImage(file, {
        rotation,
        brightness: enhance ? 1.08 : 1,
        contrast: enhance ? 1.28 : 1,
        quad: pixelQuad,
        maxDimension: 2400,
      });
      onConfirm(edited);
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="space-y-4">
      <div
        ref={surfaceRef}
        className="relative overflow-hidden rounded-xl border border-line bg-forest-900"
        style={{ touchAction: activeHandle === null ? 'auto' : 'none' }}
      >
        {objectUrl ? (
          // Local object URL for a file the user just captured.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={objectUrl}
            alt={`Page ${pageNumber} preview`}
            className="block max-h-[62vh] w-full object-contain transition-[filter,transform] duration-200"
            style={{
              transform: `rotate(${rotation}deg)`,
              filter: enhance ? 'brightness(1.08) contrast(1.28)' : undefined,
            }}
          />
        ) : (
          <div className="skeleton aspect-[3/4] w-full" />
        )}

        {cropEnabled ? (
          <>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-forest-900/55"
              style={{ clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${polygon}, 0 0)` }}
            />
            <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full">
              <polygon
                points={quad.map((point) => `${point.x * 100}%,${point.y * 100}%`).join(' ')}
                fill="none"
                stroke="hsl(150 45% 76%)"
                strokeWidth="2"
                strokeDasharray="6 4"
                vectorEffect="non-scaling-stroke"
              />
            </svg>

            {quad.map((point, index) => (
              <button
                key={HANDLE_LABELS[index]}
                type="button"
                aria-label={`${HANDLE_LABELS[index]} corner. Use the arrow keys to move it.`}
                className="absolute h-11 w-11 -translate-x-1/2 -translate-y-1/2 rounded-full focus-visible:outline-none"
                style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setActiveHandle(index);
                }}
                onPointerMove={(event) => {
                  if (activeHandle !== index) return;
                  moveHandle(index, event.clientX, event.clientY);
                }}
                onPointerUp={(event) => {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                  setActiveHandle(null);
                }}
                onPointerCancel={() => setActiveHandle(null)}
                onKeyDown={(event) => onHandleKeyDown(index, event)}
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none mx-auto block h-5 w-5 rounded-full border-[3px] border-white bg-green-600 shadow-float"
                />
              </button>
            ))}
          </>
        ) : null}
      </div>

      {blurry ? (
        <p role="status" className="flex items-start gap-2 rounded-lg border border-warning-500/40 bg-warning-50 px-4 py-3 text-sm font-medium text-warning-600">
          <TriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          This photo looks blurry. It will still be saved, but the details may not be read correctly — a steadier shot in
          better light usually works better.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={cropEnabled ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setCropEnabled((current) => !current)}
          icon={<Crop className="h-4 w-4" />}
          aria-pressed={cropEnabled}
        >
          Crop &amp; straighten
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setRotation((current) => (current + 270) % 360)}
          icon={<RotateCcw className="h-4 w-4" />}
        >
          Rotate left
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setRotation((current) => (current + 90) % 360)}
          icon={<RotateCw className="h-4 w-4" />}
        >
          Rotate right
        </Button>
        <Button
          variant={enhance ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setEnhance((current) => !current)}
          icon={<Sparkles className="h-4 w-4" />}
          aria-pressed={enhance}
        >
          Brighten
        </Button>
        {cropEnabled ? (
          <Button variant="ghost" size="sm" onClick={() => setQuad(DEFAULT_QUAD)} icon={<Undo2 className="h-4 w-4" />}>
            Reset corners
          </Button>
        ) : null}
      </div>

      <div className="flex flex-col gap-2.5 sm:flex-row">
        <Button variant="secondary" fullWidth onClick={onRetake} disabled={applying || busy}>
          Retake
        </Button>
        {onRemove ? (
          <Button variant="ghost" fullWidth onClick={onRemove} disabled={applying || busy} icon={<Trash2 className="h-4 w-4" />}>
            Remove page
          </Button>
        ) : null}
        <Button fullWidth onClick={apply} loading={applying || busy} loadingText="Preparing…">
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}
