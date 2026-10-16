'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui';

interface CameraModalProps {
  open: boolean;
  title: string;
  overlayLines: string[];
  onClose: () => void;
  onCapture: (blob: Blob) => void;
}

/**
 * Modal kamera dengan watermark anti-tipu (waktu server, koordinat, identitas, hash)
 * yang digambar langsung ke dalam foto sebelum dikirim.
 */
export function CameraModal({ open, title, overlayLines, onClose, onCapture }: CameraModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setStarting(true);

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Kamera tidak tersedia.');
        }
      } finally {
        if (!cancelled) setStarting(false);
      }
    };

    start();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [open ]);

  if (!open) return null;

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return;

    const w = video.videoWidth;
    const h = video.videoHeight;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, w, h);

    // Pita watermark di bagian bawah foto
    const pad = 16;
    const lineH = 26;
    const needH = pad * 2 + overlayLines.length * lineH;
    const bandH = Math.max(90, h * 0.14, needH);
    const bandTop = h - bandH;

    ctx.save();
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, bandTop, w, bandH);
    ctx.restore();

    ctx.fillStyle = '#ffffff';
    ctx.font = '20px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    overlayLines.forEach((line, i) => {
      ctx.fillText(line, pad, bandTop + pad + i * lineH);
    });

    // Baris terakhir digambar ulang kecil di kanan bawah
    const last = overlayLines[overlayLines.length - 1];
    if (last) {
      ctx.font = '14px monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(last, w - pad, bandTop + bandH - pad);
    }

    canvas.toBlob(
      (b) => {
        if (b) onCapture(b);
      },
      'image/jpeg',
      0.85,
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup kamera"
            className="rounded-lg px-2 py-1 text-lg leading-none text-slate-500 hover:bg-slate-100"
          >
            ✕
          </button>
        </div>

        {error ? (
          <div>
            <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              Tidak dapat mengakses kamera: {error}
            </div>
            <Button onClick={onClose}>Tutup</Button>
          </div>
        ) : (
          <div>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full rounded-xl bg-black"
            />
            {starting && (
              <p className="mt-2 text-center text-sm text-slate-500">Menyiapkan kamera…</p>
            )}
            <div className="mt-3 flex gap-2">
              <Button onClick={handleCapture} disabled={starting} className="flex-1">
                Ambil Foto
              </Button>
              <Button variant="secondary" onClick={onClose}>
                Batal
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
