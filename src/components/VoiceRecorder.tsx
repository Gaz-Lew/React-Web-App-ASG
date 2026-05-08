import { useState, useRef, useCallback } from "react";
import { Mic, Square, Play, Pause, Upload, CheckCircle, AlertCircle } from "lucide-react";
import { useAppStore } from "../stores/appStore";
import { uploadFile } from "../lib/storage";
import { saveVoiceSampleUrl } from "../services/userProfileService";

type Status = "idle" | "recording" | "recorded" | "uploading" | "done" | "error";

function pickMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/mp4",
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

function mimeToExt(mime: string): string {
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

export function VoiceRecorder() {
  const { currentUser } = useAppStore();
  const [status, setStatus] = useState<Status>("idle");
  const [audioURL, setAudioURL] = useState<string | null>(null);
  const [uploadedURL, setUploadedURL] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioBlobRef = useRef<Blob | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = useCallback(async () => {
    setErrorMsg(null);
    setAudioURL(null);
    setUploadedURL(null);
    chunksRef.current = [];
    audioBlobRef.current = null;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setErrorMsg("Microphone access denied. Please allow microphone permission and try again.");
      setStatus("error");
      return;
    }

    streamRef.current = stream;
    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
      audioBlobRef.current = blob;
      setAudioURL(URL.createObjectURL(blob));
      setStatus("recorded");
      stream.getTracks().forEach((t) => t.stop());
    };

    recorder.start();
    mediaRecorderRef.current = recorder;
    setStatus("recording");
  }, []);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
  }, []);

  const togglePlayback = useCallback(() => {
    const el = audioElRef.current;
    if (!el) return;
    if (isPlaying) {
      el.pause();
      setIsPlaying(false);
    } else {
      el.play();
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const handleUpload = useCallback(async () => {
    const blob = audioBlobRef.current;
    if (!blob || !currentUser) return;

    const mimeType = blob.type;
    const ext = mimeToExt(mimeType);
    const path = `voiceSamples/${currentUser.id}/${Date.now()}.${ext}`;

    setStatus("uploading");
    setErrorMsg(null);
    try {
      const url = await uploadFile(path, blob);
      await saveVoiceSampleUrl(String(currentUser.id), url);
      setUploadedURL(url);
      setStatus("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Upload failed");
      setStatus("error");
    }
  }, [currentUser]);

  const reset = useCallback(() => {
    if (audioURL) URL.revokeObjectURL(audioURL);
    setAudioURL(null);
    setUploadedURL(null);
    setIsPlaying(false);
    setErrorMsg(null);
    setStatus("idle");
    audioBlobRef.current = null;
    chunksRef.current = [];
    mediaRecorderRef.current = null;
  }, [audioURL]);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4 max-w-md">
      <div className="flex items-center gap-2">
        <Mic size={16} className="text-violet-500" />
        <h3 className="text-sm font-semibold text-[var(--text)]">Voice Sample</h3>
        {status === "recording" && (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-red-500 font-medium">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            Recording…
          </span>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        {status === "idle" || status === "error" ? (
          <button
            onClick={startRecording}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-500 text-white text-sm font-medium hover:bg-violet-400 transition"
          >
            <Mic size={14} />
            Record
          </button>
        ) : status === "recording" ? (
          <button
            onClick={stopRecording}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-400 transition"
          >
            <Square size={14} />
            Stop
          </button>
        ) : null}

        {(status === "recorded" || status === "done") && audioURL && (
          <>
            <audio
              ref={audioElRef}
              src={audioURL}
              onEnded={() => setIsPlaying(false)}
              className="hidden"
            />
            <button
              onClick={togglePlayback}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] text-sm font-medium hover:bg-[var(--hover)] transition"
            >
              {isPlaying ? <Pause size={14} /> : <Play size={14} />}
              {isPlaying ? "Pause" : "Play"}
            </button>

            {status === "recorded" && (
              <button
                onClick={handleUpload}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-400 transition"
              >
                <Upload size={14} />
                Save
              </button>
            )}

            <button
              onClick={reset}
              className="px-3 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition"
            >
              Discard
            </button>
          </>
        )}

        {status === "uploading" && (
          <span className="text-sm text-[var(--text-muted)] animate-pulse">Uploading…</span>
        )}
      </div>

      {/* Status messages */}
      {status === "done" && uploadedURL && (
        <div className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
          <CheckCircle size={14} />
          Saved successfully
        </div>
      )}

      {errorMsg && (
        <div className="flex items-start gap-1.5 text-sm text-red-500">
          <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
          {errorMsg}
        </div>
      )}

      {!("mediaDevices" in navigator) && (
        <p className="text-xs text-[var(--text-muted)]">
          Voice recording is not supported in this browser.
        </p>
      )}
    </div>
  );
}
