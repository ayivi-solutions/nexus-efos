"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

// Real camera-based QR/barcode scanning — navigator.mediaDevices for the
// camera feed, jsQR for decoding via canvas frame sampling (chosen over
// the native BarcodeDetector API since that isn't supported on
// Safari/iOS yet, and this needs to work on any phone in the field).
export function CodeScanner({ onDetected, onClose }: { onDetected: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(true);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let rafId: number;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
        tick();
      } catch (err: any) {
        setError(err.name === "NotAllowedError" ? "Camera access was denied. Allow camera access to scan." : "Could not access the camera.");
      }
    }

    function tick() {
      if (!scanning || !videoRef.current || !canvasRef.current) { rafId = requestAnimationFrame(tick); return; }
      const video = videoRef.current, canvas = canvasRef.current;
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.height = video.videoHeight; canvas.width = video.videoWidth;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code && code.data) { setScanning(false); onDetected(code.data); return; }
        }
      }
      rafId = requestAnimationFrame(tick);
    }

    start();
    return () => { if (stream) stream.getTracks().forEach((t) => t.stop()); if (rafId) cancelAnimationFrame(rafId); };
  }, [scanning, onDetected]);

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-4">
      <div className="relative w-full max-w-md aspect-square rounded-lg overflow-hidden bg-black">
        <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
        <canvas ref={canvasRef} className="hidden" />
        <div className="absolute inset-8 border-2 border-gold-500 rounded-lg pointer-events-none" />
      </div>
      {error && <div className="text-rose-400 text-sm mt-4 max-w-md text-center">{error}</div>}
      {!error && <div className="text-white/70 text-sm mt-4">Point the camera at an asset's QR code or barcode.</div>}
      <button onClick={onClose} className="mt-6 px-5 py-2 rounded-full bg-white/10 text-white text-sm hover:bg-white/20">Cancel</button>
    </div>
  );
}
