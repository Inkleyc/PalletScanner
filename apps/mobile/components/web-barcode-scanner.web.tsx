import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { useEffect, useRef } from "react";

type WebBarcodeScannerProps = {
  active: boolean;
  onDetected: (data: string) => void;
  onError: (message: string) => void;
  onReady: () => void;
};

export function WebBarcodeScanner({ active, onDetected, onError, onReady }: WebBarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const callbacksRef = useRef({ onDetected, onError, onReady });
  callbacksRef.current = { onDetected, onError, onReady };

  useEffect(() => {
    if (!active || !videoRef.current) return undefined;

    const reader = new BrowserMultiFormatReader();
    const video = videoRef.current;
    let controls: IScannerControls | null = null;
    let cancelled = false;

    void reader
      .decodeFromConstraints(
        { audio: false, video: { facingMode: { ideal: "environment" } } },
        video,
        (result) => {
          const text = result?.getText().trim();
          if (text) callbacksRef.current.onDetected(text);
        },
      )
      .then((nextControls) => {
        if (cancelled) {
          nextControls.stop();
          return;
        }
        controls = nextControls;
        callbacksRef.current.onReady();
      })
      .catch((error: unknown) => {
        if (!cancelled) callbacksRef.current.onError(error instanceof Error ? error.message : "The browser camera could not start.");
      });

    return () => {
      cancelled = true;
      controls?.stop();
      const stream = video.srcObject;
      if (stream instanceof MediaStream) stream.getTracks().forEach((track) => track.stop());
    };
  }, [active]);

  return <video ref={videoRef} autoPlay muted playsInline aria-label="Live barcode scanner" style={{ display: "block", height: 280, objectFit: "cover", width: "100%" }} />;
}
