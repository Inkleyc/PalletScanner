import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type WebCapturedPhoto = {
  base64: string;
  height: number;
  type: "image";
  uri: string;
  width: number;
};

type WebPhotoCameraProps = {
  active: boolean;
  guidance: string;
  onCancel: () => void;
  onCapture: (photo: WebCapturedPhoto) => void;
};

export function WebPhotoCamera({ active, guidance, onCancel, onCapture }: WebPhotoCameraProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!active || !videoRef.current) return undefined;
    let stream: MediaStream | null = null;
    let cancelled = false;
    setError("");
    void navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" } } })
      .then((nextStream) => {
        if (cancelled || !videoRef.current) {
          nextStream.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = nextStream;
        videoRef.current.srcObject = nextStream;
      })
      .catch((cameraError: unknown) => setError(cameraError instanceof Error ? cameraError.message : "The camera could not start."));
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [active]);

  if (!active) return null;

  const capture = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const uri = canvas.toDataURL("image/jpeg", 0.82);
    onCapture({ base64: uri.split(",")[1], height: canvas.height, type: "image", uri, width: canvas.width });
  };

  return createPortal(<div role="dialog" aria-modal="true" aria-label="Take product photo" style={{ alignItems: "center", background: "rgba(10, 20, 30, 0.88)", boxSizing: "border-box", display: "flex", inset: 0, justifyContent: "center", overflowY: "auto", padding: 20, position: "fixed", zIndex: 10000 }}><div style={{ background: "white", borderRadius: 8, maxWidth: 720, overflow: "hidden", width: "100%" }}><div style={{ padding: "16px 18px" }}><strong style={{ display: "block", fontSize: 18 }}>Take photo</strong><span style={{ color: "#596579" }}>{guidance}</span></div>{error ? <p style={{ color: "#b42318", padding: "0 18px" }}>{error}</p> : <video ref={videoRef} autoPlay muted playsInline style={{ background: "#111", display: "block", maxHeight: "65vh", objectFit: "contain", width: "100%" }} />}<div style={{ display: "flex", gap: 10, padding: 16 }}><button type="button" onClick={onCancel} style={{ flex: 1, minHeight: 48 }}>Cancel</button><button type="button" onClick={capture} disabled={Boolean(error)} style={{ background: "#173a57", color: "white", flex: 1, fontWeight: 700, minHeight: 48 }}>Capture</button></div></div></div>, document.body);
}
