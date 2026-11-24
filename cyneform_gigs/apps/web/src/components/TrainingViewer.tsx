import type { ViewSession } from "@cyneform/types";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { Alert, Button } from "./ui";

function watermark(ctx: CanvasRenderingContext2D, w: number, h: number, label: string) {
  ctx.save();
  ctx.globalAlpha = 0.24;
  ctx.fillStyle = "#64748b";
  ctx.font = "18px sans-serif";
  ctx.rotate(-Math.PI / 5);
  for (let y = -h; y < h * 2; y += 130)
    for (let x = -w; x < w * 2; x += 300) ctx.fillText(label, x, y);
  ctx.restore();
}

export function TrainingViewer({
  session,
  onDownload,
  onClose,
  onPlay,
}: {
  session: ViewSession;
  onDownload: () => void;
  onClose: () => void;
  onPlay: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const mediaUrl = useRef<string | null>(null);
  const [error, setError] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  useEffect(() => {
    let dead = false;
    async function render() {
      try {
        if (session.fileType === "docx" || session.fileType === "pptx") return;
        const blob = await api<Blob>(session.url, { blob: true });
        if (dead || !host.current) return;
        if (session.fileType === "mp4") {
          mediaUrl.current = URL.createObjectURL(blob);
          setVideoUrl(mediaUrl.current);
          return;
        }
        if (session.fileType === "jpg" || session.fileType === "png") {
          const img = new Image();
          img.src = URL.createObjectURL(blob);
          await img.decode();
          const c = document.createElement("canvas");
          const scale = Math.min(1, 1400 / img.width);
          c.width = img.width * scale;
          c.height = img.height * scale;
          const ctx = c.getContext("2d");
          if (ctx) {
            ctx.drawImage(img, 0, 0, c.width, c.height);
            watermark(ctx, c.width, c.height, session.watermark);
          }
          host.current.append(c);
          URL.revokeObjectURL(img.src);
          return;
        }
        if (session.fileType === "pdf") {
          mediaUrl.current = URL.createObjectURL(blob);
          setPdfUrl(mediaUrl.current);
          return;
        }
      } catch {
        if (!dead)
          setError(
            "This link has expired or the file could not be loaded. Close and open it again.",
          );
      }
    }
    void render();
    return () => {
      dead = true;
      host.current?.replaceChildren();
      if (mediaUrl.current) URL.revokeObjectURL(mediaUrl.current);
      mediaUrl.current = null;
    };
  }, [session]);
  const video = session.fileType === "mp4";
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-slate-900/95 print:hidden"
      role="dialog"
      aria-modal="true"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="flex items-center justify-between bg-white px-4 py-2">
        <b>{session.title}</b>
        <Button onClick={onClose}>Close</Button>
      </div>
      <div className="relative flex-1 overflow-auto p-4" style={{ userSelect: "none" }}>
        {error && <Alert tone="error">{error}</Alert>}
        {(session.fileType === "docx" || session.fileType === "pptx") && (
          <div className="mx-auto max-w-md rounded bg-white p-4">
            This file type cannot be previewed securely. Your download is logged against your
            account.
            <Button className="mt-3" onClick={onDownload}>
              Download
            </Button>
          </div>
        )}
        {video && videoUrl && (
          <div className="relative mx-auto max-w-4xl">
            {/* biome-ignore lint/a11y/useMediaCaption: no caption file is provided with this training video */}
            <video
              src={videoUrl}
              onPlay={onPlay}
              controls
              controlsList="nodownload"
              disablePictureInPicture
              onContextMenu={(e) => e.preventDefault()}
              className="w-full rounded bg-black"
            />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
              <span className="-rotate-12 whitespace-nowrap text-2xl text-white/25">
                {session.watermark}
              </span>
            </div>
          </div>
        )}
        {session.fileType === "pdf" && pdfUrl && (
          <div className="relative mx-auto h-full min-h-[70vh] max-w-5xl">
            <iframe
              title={session.title}
              src={`${pdfUrl}#toolbar=0&navpanes=0`}
              className="h-full min-h-[70vh] w-full bg-white"
            />
            <div className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden">
              <span className="-rotate-12 whitespace-nowrap text-xl text-slate-700/25">
                {session.watermark}
              </span>
            </div>
          </div>
        )}
        <div ref={host} />
      </div>
    </div>
  );
}
