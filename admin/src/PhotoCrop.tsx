import { useEffect, useRef, useState } from 'react';

export type CropKind = 'hero' | 'gallery';

/** Shop header is full width × 228pt. Gallery cards are 120×160. */
const FRAME = {
  hero: { w: 360, h: Math.round((360 * 228) / 390), label: 'Shop header' },
  gallery: { w: 180, h: 240, label: 'Gallery card' }
} as const;

export function PhotoCrop({
  file,
  kind,
  onCancel,
  onDone
}: {
  file: File;
  kind: CropKind;
  onCancel: () => void;
  onDone: (dataUrl: string) => void;
}) {
  const frame = FRAME[kind];
  const [url, setUrl] = useState('');
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    return () => URL.revokeObjectURL(next);
  }, [file]);

  const cover =
    natural.w > 0 ? Math.max(frame.w / natural.w, frame.h / natural.h) : 1;
  const scale = cover * zoom;
  const dispW = natural.w * scale;
  const dispH = natural.h * scale;

  function clamp(x: number, y: number, z = zoom) {
    const s = cover * z;
    const maxX = Math.max(0, (natural.w * s - frame.w) / 2);
    const maxY = Math.max(0, (natural.h * s - frame.h) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) };
  }

  function confirm() {
    const image = imgRef.current;
    if (!image || natural.w === 0) return;
    const outW = kind === 'hero' ? 1170 : 480;
    const outH = kind === 'hero' ? Math.round((1170 * 228) / 390) : 640;
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const sx = (-((frame.w - dispW) / 2 + offset.x)) / scale;
    const sy = (-((frame.h - dispH) / 2 + offset.y)) / scale;
    ctx.drawImage(image, sx, sy, frame.w / scale, frame.h / scale, 0, 0, outW, outH);
    onDone(canvas.toDataURL('image/jpeg', 0.86));
  }

  const left = (frame.w - dispW) / 2 + offset.x;
  const top = (frame.h - dispH) / 2 + offset.y;

  return (
    <div className="crop-back" role="dialog" aria-modal="true" aria-label={`Position ${frame.label}`}>
      <div className="crop-card">
        <h2>{frame.label}</h2>
        <p className="hint">Drag the photo so the shop screen shows the part you want. The grid is the same shape as the app.</p>
        <div
          className="crop-frame"
          style={{ width: frame.w, height: frame.h }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            setOffset(clamp(drag.current.ox + e.clientX - drag.current.x, drag.current.oy + e.clientY - drag.current.y));
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
        >
          {url ? (
            <img
              ref={imgRef}
              src={url}
              alt=""
              draggable={false}
              onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              style={{ width: dispW || '100%', height: dispH || '100%', left, top }}
            />
          ) : null}
          <div className="crop-grid" />
        </div>
        <label className="crop-zoom">
          Zoom
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => {
              const next = Number(e.target.value);
              setZoom(next);
              setOffset((prev) => clamp(prev.x, prev.y, next));
            }}
          />
        </label>
        <div className="row">
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn teal" onClick={confirm} disabled={natural.w === 0}>
            Use this crop
          </button>
        </div>
      </div>
    </div>
  );
}
