import React, { useEffect, useId, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, Keyboard, ScanLine, X } from 'lucide-react';

interface BarcodeScannerModalProps {
  open: boolean;
  title?: string;
  onDetected: (code: string) => void;
  onClose: () => void;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  open,
  title = 'Pindai Barcode Produk',
  onDetected,
  onClose,
}) => {
  const elementId = `barcode-reader-${useId().replace(/:/g, '')}`;
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const detectedOnceRef = useRef(false);
  const [cameraError, setCameraError] = useState<string>('');
  const [manualCode, setManualCode] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    detectedOnceRef.current = false;
    setCameraError('');
    setManualCode('');

    let cancelled = false;
    const html5Qr = new Html5Qrcode(elementId);
    scannerRef.current = html5Qr;

    const startCamera = async () => {
      try {
        await html5Qr.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 240, height: 140 } },
          (decodedText) => {
            if (cancelled || detectedOnceRef.current) return;
            const cleaned = decodedText.trim();
            if (!cleaned) return;
            detectedOnceRef.current = true;
            onDetected(cleaned);
            onClose();
          },
          () => {
            // Ignore per-frame decode misses
          }
        );
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setCameraError(
          msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('denied')
            ? 'Izin kamera belum diberikan. Anda tetap dapat memasukkan kode barcode atau menggunakan scanner USB di bawah.'
            : 'Kamera tidak tersedia pada perangkat/browser ini. Gunakan input kode manual atau scanner USB di bawah.'
        );
      }
    };

    const timer = setTimeout(() => {
      void startCamera();
    }, 120);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      const instance = scannerRef.current;
      scannerRef.current = null;
      if (instance) {
        instance
          .stop()
          .catch(() => undefined)
          .finally(() => {
            try {
              instance.clear();
            } catch {
              // Ignore cleanup errors
            }
          });
      }
    };
  }, [open, elementId, onDetected, onClose]);

  if (!open) return null;

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = manualCode.trim();
    if (!cleaned) return;
    onDetected(cleaned);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 flex items-center justify-center">
              <ScanLine className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                {title}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Kamera atau scanner barcode USB
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Tutup pemindai"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-950 min-h-[220px] flex items-center justify-center relative">
            <div id={elementId} className="w-full" />
            {cameraError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-5 text-center bg-slate-900/95 text-slate-200 gap-2">
                <Camera className="w-8 h-8 text-slate-400" />
                <p className="text-xs leading-relaxed text-slate-300">{cameraError}</p>
              </div>
            )}
          </div>

          <form onSubmit={handleManualSubmit} className="space-y-2">
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
              <Keyboard className="w-3.5 h-3.5" />
              Input Manual / Scanner Barcode USB
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                autoFocus
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="Ketik atau tembak barcode (Enter)..."
                className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
              />
              <button
                type="submit"
                disabled={!manualCode.trim()}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors whitespace-nowrap disabled:opacity-50"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                Pakai
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
