/**
 * TrainingHub.tsx — Training Hub with 4 tabs
 *
 * Tabs:
 *  1. Simulation — AI Roleplay + Courses + SOP
 *  2. Documents  — Upload & manage training PDFs/DOCX
 *  3. Videos     — YouTube embeds + uploaded videos
 *  4. Recordings — Saved AI roleplay session recordings
 *
 * Firestore:
 *  - trainingDocuments
 *  - trainingVideos
 *  - trainingRecordings
 *  - trainingCourses / trainingModules / userProgress (existing)
 */

import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { collection, onSnapshot, query, orderBy, doc, setDoc, limit } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAppStore } from "../stores/appStore";
import { AIRoleplayPage } from "../components/AIRoleplay";
import { RoleplayDashboard } from "../components/RoleplayDashboard";
import { ScenarioSelector } from "../components/AICoachingPanel";
import { TRAINING_SCENARIOS, type TrainingScenario } from "../data/knowledgeStructured";
import {
  useTrainingDocuments,
  useSaveTrainingDocument,
  useDeleteTrainingDocument,
  usePinTrainingDocument,
  useTrainingVideos,
  useSaveTrainingVideo,
  useDeleteTrainingVideo,
  usePinTrainingVideo,
  useTrainingRecordings,
} from "../hooks/useTrainingLibrary";
import { formatFileSize } from "../lib/storage";
import {
  BookOpen,
  Play,
  CheckCircle,
  CheckSquare,
  Square,
  ChevronLeft,
  FileText,
  Loader,
  ArrowLeft,
  Target,
  Award,
  Clock,
  Star,
  Users,
  Search,
  X,
  GraduationCap,
  TrendingUp,
  Upload,
  Download,
  Trash2,
  Pin,
  PinOff,
  Video,
  Youtube,
  Mic,
  FileAudio,
  Filter,
  Plus,
  ExternalLink,
  AlertCircle,
  Eye,
  ChevronRight,
  File,
} from "lucide-react";
import type { TrainingDocument, TrainingVideo, TrainingRecording } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Shared styles
// ─────────────────────────────────────────────────────────────────────────────

const CARD = "bg-white dark:bg-[#16161A] border border-gray-200 dark:border-white/[0.06] rounded-xl p-4 shadow-sm";
const TAB_ACTIVE =
  "px-4 py-2 rounded-lg text-sm font-semibold bg-[#b8933a]/10 text-[#b8933a] border border-[#b8933a]/30 transition-all";
const TAB_INACTIVE =
  "px-4 py-2 rounded-lg text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 transition-all";
const INPUT_CLS =
  "w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#b8933a]/40";
const BTN_AMBER =
  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-[#b8933a] text-white hover:bg-[#d4aa55] disabled:opacity-40 disabled:cursor-not-allowed transition";
const BTN_GHOST =
  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 transition";

// ─────────────────────────────────────────────────────────────────────────────
// Local types for existing features
// ─────────────────────────────────────────────────────────────────────────────

interface TrainingCourse {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  estimatedHours: number;
  order: number;
  createdAt: number;
}

interface TrainingModule {
  id: string;
  courseId: string;
  title: string;
  type: "video" | "text" | "checklist";
  content: string;
  videoUrl?: string;
  checklistItems?: string[];
  order: number;
  durationMins: number;
}

interface UserProgress {
  courseId: string;
  moduleId: string;
  userId: string;
  completed: boolean;
  completedAt?: number;
  startedAt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Existing hooks (courses, modules, progress)
// ─────────────────────────────────────────────────────────────────────────────

function useTrainingCourses() {
  const [courses, setCourses] = useState<TrainingCourse[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const q = query(collection(db, "trainingCourses"), orderBy("order", "asc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setCourses(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as TrainingCourse));
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, []);
  return { courses, loading };
}

function useTrainingModules(courseId: string | null) {
  const [modules, setModules] = useState<TrainingModule[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!courseId) {
      setModules([]);
      setLoading(false);
      return;
    }
    const q = query(collection(db, "trainingModules"), orderBy("order", "asc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setModules(
          snap.docs.map((d) => ({ id: d.id, ...d.data() }) as TrainingModule).filter((m) => m.courseId === courseId),
        );
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, [courseId]);
  return { modules, loading };
}

function useUserProgress(userId: string) {
  const [progress, setProgress] = useState<UserProgress[]>([]);
  useEffect(() => {
    if (!userId) return;
    const q = query(collection(db, "userProgress"));
    const unsub = onSnapshot(q, (snap) => {
      setProgress(snap.docs.map((d) => ({ ...d.data() }) as UserProgress).filter((p) => p.userId === userId));
    });
    return () => unsub();
  }, [userId]);
  return { progress };
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────────────────────

function getYouTubeEmbedUrl(url: string): string | null {
  try {
    // Handle youtu.be/ID and youtube.com/watch?v=ID
    const u = new URL(url);
    if (u.hostname === "youtu.be") {
      return `https://www.youtube.com/embed${u.pathname}`;
    }
    const v = u.searchParams.get("v");
    if (v) return `https://www.youtube.com/embed/${v}`;
  } catch {
    /* invalid URL */
  }
  if (url.includes("youtube.com/embed/")) return url;
  return null;
}

function getYouTubeThumbnail(url: string): string | null {
  const embed = getYouTubeEmbedUrl(url);
  if (!embed) return null;
  const id = embed.split("/embed/")[1]?.split("?")[0];
  return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Documents
// ─────────────────────────────────────────────────────────────────────────────

function DocumentsTab({ repId, repName }: { repId: number; repName: string }) {
  const { documents, loading } = useTrainingDocuments();
  const { upload, saving } = useSaveTrainingDocument();
  const { remove } = useDeleteTrainingDocument();
  const { pin, unpin } = usePinTrainingDocument();
  const fileRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [showUpload, setShowUpload] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadDesc, setUploadDesc] = useState("");
  const [uploadCat, setUploadCat] = useState("General");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [previewDoc, setPreviewDoc] = useState<TrainingDocument | null>(null);

  const CATEGORIES = ["All", "Scripts", "SOPs", "Compliance", "Product", "General"];

  const filtered = useMemo(() => {
    let list = documents;
    if (category !== "All") list = list.filter((d) => d.category === category);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((d) => d.title.toLowerCase().includes(q) || d.category.toLowerCase().includes(q));
    }
    return list;
  }, [documents, category, search]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      setUploadError("Please select a file.");
      return;
    }
    if (!uploadTitle.trim()) {
      setUploadError("Title is required.");
      return;
    }
    setUploadError("");
    try {
      await upload(uploadFile, {
        title: uploadTitle.trim(),
        description: uploadDesc.trim() || undefined,
        category: uploadCat,
        uploadedBy: repName,
        uploadedById: repId,
        pinnedByReps: [],
      });
      setShowUpload(false);
      setUploadTitle("");
      setUploadDesc("");
      setUploadFile(null);
    } catch (err) {
      setUploadError("Upload failed. Please try again.");
    }
  };

  const isPinned = (doc: TrainingDocument) => (doc.pinnedByReps ?? []).includes(repId);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documents…"
            className={INPUT_CLS + " pl-8"}
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                category === c
                  ? "bg-[#b8933a] text-white"
                  : "bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <button onClick={() => setShowUpload(true)} className={BTN_AMBER}>
          <Upload size={14} /> Upload
        </button>
      </div>

      {/* Upload form */}
      {showUpload && (
        <div className={CARD + " border-[#b8933a]/30"}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Upload Document</h3>
            <button
              onClick={() => setShowUpload(false)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X size={16} />
            </button>
          </div>
          <form onSubmit={handleUpload} className="space-y-3">
            <input
              value={uploadTitle}
              onChange={(e) => setUploadTitle(e.target.value)}
              placeholder="Document title *"
              className={INPUT_CLS}
            />
            <input
              value={uploadDesc}
              onChange={(e) => setUploadDesc(e.target.value)}
              placeholder="Description (optional)"
              className={INPUT_CLS}
            />
            <select value={uploadCat} onChange={(e) => setUploadCat(e.target.value)} className={INPUT_CLS}>
              {["Scripts", "SOPs", "Compliance", "Product", "General"].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-gray-300 dark:border-white/10 rounded-lg p-4 text-center cursor-pointer hover:border-[#b8933a]/50 transition"
            >
              <Upload size={20} className="mx-auto mb-1 text-gray-400" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {uploadFile ? uploadFile.name : "Click to select PDF or DOCX"}
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.docx,.doc"
                className="hidden"
                onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
              />
            </div>
            {uploadError && <p className="text-red-500 text-xs">{uploadError}</p>}
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowUpload(false)} className={BTN_GHOST}>
                Cancel
              </button>
              <button type="submit" disabled={saving} className={BTN_AMBER}>
                {saving ? (
                  <>
                    <Loader size={13} className="animate-spin" /> Uploading…
                  </>
                ) : (
                  <>
                    <Upload size={13} /> Upload
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Documents grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <Loader size={20} className="animate-spin mr-2" /> Loading documents…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <FileText size={40} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">
            {search || category !== "All" ? "No documents match your filters." : "No documents uploaded yet."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((doc) => (
            <div key={doc.id} className={CARD + " flex flex-col gap-3 hover:border-[#b8933a]/30 transition group"}>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-50 dark:bg-red-900/20 flex items-center justify-center flex-shrink-0">
                  <FileText size={18} className="text-red-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-gray-900 dark:text-white truncate">{doc.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400">
                      {doc.category}
                    </span>
                    <span className="text-xs text-gray-400">{formatFileSize(doc.fileSize)}</span>
                  </div>
                  {doc.description && <p className="text-xs text-gray-400 mt-1 line-clamp-2">{doc.description}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2 border-t border-gray-100 dark:border-white/5 pt-2">
                <button
                  onClick={() => window.open(doc.fileUrl, "_blank")}
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition"
                >
                  <Eye size={12} /> View
                </button>
                <button
                  onClick={() => {
                    const a = document.createElement("a");
                    a.href = doc.fileUrl;
                    a.download = doc.title;
                    a.click();
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition"
                >
                  <Download size={12} /> Download
                </button>
                <button
                  onClick={() => (isPinned(doc) ? unpin(doc.id, repId) : pin(doc.id, repId))}
                  className={`flex-1 flex items-center justify-center gap-1.5 text-xs transition ${
                    isPinned(doc) ? "text-[#b8933a]" : "text-gray-400 hover:text-[#b8933a]"
                  }`}
                  title={isPinned(doc) ? "Unpin" : "Pin to dashboard"}
                >
                  {isPinned(doc) ? <PinOff size={12} /> : <Pin size={12} />}
                  {isPinned(doc) ? "Pinned" : "Pin"}
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Delete "${doc.title}"?`)) remove(doc);
                  }}
                  className="text-red-400 hover:text-red-600 transition p-1"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Videos
// ─────────────────────────────────────────────────────────────────────────────

function VideosTab({ repId, repName }: { repId: number; repName: string }) {
  const { videos, loading } = useTrainingVideos();
  const { save, saving } = useSaveTrainingVideo();
  const { remove } = useDeleteTrainingVideo();
  const { pin, unpin } = usePinTrainingVideo();

  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", category: "", youtubeUrl: "", durationMins: "" });
  const [error, setError] = useState("");
  const [playingId, setPlayingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return videos;
    const q = search.toLowerCase();
    return videos.filter((v) => v.title.toLowerCase().includes(q) || (v.description ?? "").toLowerCase().includes(q));
  }, [videos, search]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!form.youtubeUrl.trim()) {
      setError("YouTube URL is required.");
      return;
    }
    const embedUrl = getYouTubeEmbedUrl(form.youtubeUrl.trim());
    if (!embedUrl) {
      setError("Please enter a valid YouTube URL.");
      return;
    }
    setError("");
    try {
      await save({
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        category: form.category.trim() || undefined,
        source: "youtube",
        videoUrl: embedUrl,
        thumbnailUrl: getYouTubeThumbnail(form.youtubeUrl.trim()) ?? undefined,
        durationMins: form.durationMins ? parseInt(form.durationMins) : undefined,
        uploadedBy: repName,
        uploadedById: repId,
        pinnedByReps: [],
      });
      setShowAdd(false);
      setForm({ title: "", description: "", category: "", youtubeUrl: "", durationMins: "" });
    } catch {
      setError("Failed to add video. Please try again.");
    }
  };

  const isPinned = (v: TrainingVideo) => (v.pinnedByReps ?? []).includes(repId);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search videos…"
            className={INPUT_CLS + " pl-8"}
          />
        </div>
        <button onClick={() => setShowAdd(true)} className={BTN_AMBER}>
          <Plus size={14} /> Add Video
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className={CARD + " border-[#b8933a]/30"}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm text-gray-900 dark:text-white">Add YouTube Video</h3>
            <button
              onClick={() => setShowAdd(false)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X size={16} />
            </button>
          </div>
          <form onSubmit={handleAdd} className="space-y-3">
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Title *"
              className={INPUT_CLS}
            />
            <input
              value={form.youtubeUrl}
              onChange={(e) => setForm((f) => ({ ...f, youtubeUrl: e.target.value }))}
              placeholder="YouTube URL (e.g. https://youtu.be/...)"
              className={INPUT_CLS}
            />
            <input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Description (optional)"
              className={INPUT_CLS}
            />
            <div className="flex gap-2">
              <input
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                placeholder="Category (optional)"
                className={INPUT_CLS}
              />
              <input
                value={form.durationMins}
                onChange={(e) => setForm((f) => ({ ...f, durationMins: e.target.value.replace(/\D/g, "") }))}
                placeholder="Mins"
                className={INPUT_CLS + " w-24"}
              />
            </div>
            {error && <p className="text-red-500 text-xs">{error}</p>}
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowAdd(false)} className={BTN_GHOST}>
                Cancel
              </button>
              <button type="submit" disabled={saving} className={BTN_AMBER}>
                {saving ? (
                  <>
                    <Loader size={13} className="animate-spin" /> Saving…
                  </>
                ) : (
                  <>
                    <Plus size={13} /> Add Video
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Video grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <Loader size={20} className="animate-spin mr-2" /> Loading videos…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Video size={40} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">{search ? "No videos match your search." : "No videos added yet."}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((video) => (
            <div
              key={video.id}
              className={CARD + " flex flex-col gap-0 p-0 overflow-hidden hover:border-[#b8933a]/30 transition"}
            >
              {/* Thumbnail / Player */}
              <div className="relative bg-black aspect-video">
                {playingId === video.id ? (
                  <iframe
                    src={video.videoUrl + "?autoplay=1"}
                    className="w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <button onClick={() => setPlayingId(video.id)} className="w-full h-full relative group">
                    {video.thumbnailUrl ? (
                      <img src={video.thumbnailUrl} alt={video.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gray-900 flex items-center justify-center">
                        <Youtube size={32} className="text-red-500 opacity-60" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center group-hover:bg-black/20 transition">
                      <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                        <Play size={20} className="text-gray-900 ml-1" />
                      </div>
                    </div>
                    {video.durationMins && (
                      <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded">
                        {video.durationMins}m
                      </div>
                    )}
                  </button>
                )}
              </div>
              {/* Info */}
              <div className="p-3 flex flex-col gap-2 flex-1">
                <div>
                  <p className="font-medium text-sm text-gray-900 dark:text-white line-clamp-2">{video.title}</p>
                  {video.description && <p className="text-xs text-gray-400 mt-1 line-clamp-2">{video.description}</p>}
                  {video.category && (
                    <span className="inline-block mt-1 text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400">
                      {video.category}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 border-t border-gray-100 dark:border-white/5 pt-2">
                  <button
                    onClick={() => (isPinned(video) ? unpin(video.id, repId) : pin(video.id, repId))}
                    className={`flex-1 flex items-center justify-center gap-1.5 text-xs transition ${
                      isPinned(video) ? "text-[#b8933a]" : "text-gray-400 hover:text-[#b8933a]"
                    }`}
                  >
                    {isPinned(video) ? <PinOff size={12} /> : <Pin size={12} />}
                    {isPinned(video) ? "Pinned" : "Pin"}
                  </button>
                  <button
                    onClick={() => window.open(video.videoUrl.replace("/embed/", "/watch?v="), "_blank")}
                    className="flex-1 flex items-center justify-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 dark:hover:text-white transition"
                  >
                    <ExternalLink size={12} /> Open
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Delete "${video.title}"?`)) remove(video);
                    }}
                    className="text-red-400 hover:text-red-600 transition p-1"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Recordings
// ─────────────────────────────────────────────────────────────────────────────

function RecordingsTab({ repId, reps }: { repId: number; reps: Array<{ id: number; name: string }> }) {
  const [filterRepId, setFilterRepId] = useState<number | undefined>(undefined);
  const { recordings, loading } = useTrainingRecordings(filterRepId);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return recordings;
    const q = search.toLowerCase();
    return recordings.filter((r) => r.repName.toLowerCase().includes(q) || r.scenarioType.toLowerCase().includes(q));
  }, [recordings, search]);

  const scoreColor = (s?: number) => {
    if (!s) return "text-gray-400";
    if (s >= 30) return "text-green-600 dark:text-green-400";
    if (s >= 20) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
  };

  const scoreLabel = (s?: number) => {
    if (!s) return "—";
    if (s >= 30) return "Excellent";
    if (s >= 20) return "Good";
    if (s >= 10) return "Developing";
    return "Needs Work";
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search recordings…"
            className={INPUT_CLS + " pl-8"}
          />
        </div>
        <select
          value={filterRepId ?? ""}
          onChange={(e) => setFilterRepId(e.target.value ? Number(e.target.value) : undefined)}
          className={INPUT_CLS + " w-auto min-w-[140px]"}
        >
          <option value="">All Reps</option>
          {reps.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <Loader size={20} className="animate-spin mr-2" /> Loading recordings…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Mic size={40} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">No recordings found. Completed AI roleplay sessions appear here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((rec) => (
            <div key={rec.id} className={CARD + " flex flex-col sm:flex-row sm:items-center gap-3"}>
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center flex-shrink-0">
                  <Mic size={18} className="text-purple-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-gray-900 dark:text-white truncate">
                    {rec.repName} — {rec.scenarioType.replace(/_/g, " ")}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-0.5">
                    <span className={`text-xs font-semibold ${scoreColor(rec.score)}`}>
                      {rec.score ?? 0}/40 — {scoreLabel(rec.score)}
                    </span>
                    {rec.difficulty && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 capitalize">
                        {rec.difficulty}
                      </span>
                    )}
                    {rec.durationSeconds && (
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <Clock size={11} /> {Math.floor(rec.durationSeconds / 60)}m {rec.durationSeconds % 60}s
                      </span>
                    )}
                    <span className="text-xs text-gray-400">{new Date(rec.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {rec.audioUrl && <audio controls src={rec.audioUrl} className="h-8 max-w-[180px]" />}
                {rec.transcript && (
                  <button
                    onClick={() => {
                      const el = document.createElement("a");
                      el.href = "data:text/plain;charset=utf-8," + encodeURIComponent(rec.transcript!);
                      el.download = `transcript_${rec.repName}_${new Date(rec.createdAt).toISOString().split("T")[0]}.txt`;
                      el.click();
                    }}
                    className={BTN_GHOST + " text-xs"}
                  >
                    <Download size={12} /> Transcript
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Simulation (existing courses + AI roleplay)
// ─────────────────────────────────────────────────────────────────────────────

function SimulationTab({ userId, repId }: { userId: string; repId: number }) {
  const [view, setView] = useState<"home" | "courses" | "course" | "roleplay" | "history">("home");
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [selectedModuleIdx, setSelectedModuleIdx] = useState(0);

  const { courses, loading: coursesLoading } = useTrainingCourses();
  const { modules, loading: modulesLoading } = useTrainingModules(selectedCourseId);
  const { progress } = useUserProgress(userId);

  const selectedCourse = courses.find((c) => c.id === selectedCourseId);

  const isModuleDone = useCallback(
    (moduleId: string) => progress.some((p) => p.moduleId === moduleId && p.userId === userId && p.completed),
    [progress, userId],
  );

  const markModuleDone = useCallback(
    async (moduleId: string) => {
      if (!selectedCourseId || !userId) return;
      await setDoc(
        doc(db, "userProgress", `${userId}_${moduleId}`),
        {
          courseId: selectedCourseId,
          moduleId,
          userId,
          completed: true,
          completedAt: Date.now(),
          startedAt: Date.now(),
        },
        { merge: true },
      );
    },
    [selectedCourseId, userId],
  );

  const getCourseProgress = (courseId: string) => {
    const courseModules = modules.filter((m) => m.courseId === courseId);
    if (courseModules.length === 0) return 0;
    const done = courseModules.filter((m) => isModuleDone(m.id)).length;
    return Math.round((done / courseModules.length) * 100);
  };

  if (view === "roleplay") {
    return (
      <div>
        <button onClick={() => setView("home")} className={BTN_GHOST + " mb-4 text-sm"}>
          <ArrowLeft size={14} /> Back
        </button>
        <AIRoleplayPage />
      </div>
    );
  }

  if (view === "history") {
    return (
      <div>
        <button onClick={() => setView("home")} className={BTN_GHOST + " mb-4 text-sm"}>
          <ArrowLeft size={14} /> Back
        </button>
        <RoleplayDashboard repId={repId} />
      </div>
    );
  }

  if (view === "course" && selectedCourse) {
    const module = modules[selectedModuleIdx];
    return (
      <div className="space-y-4">
        <button onClick={() => setView("courses")} className={BTN_GHOST + " text-sm"}>
          <ArrowLeft size={14} /> Back to Courses
        </button>
        <div className="flex items-center gap-3">
          <span className="text-3xl">{selectedCourse.icon}</span>
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">{selectedCourse.title}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{selectedCourse.description}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Module list */}
          <div className="space-y-1">
            {modulesLoading ? (
              <div className="text-gray-400 text-sm flex items-center gap-2">
                <Loader size={14} className="animate-spin" /> Loading…
              </div>
            ) : modules.length === 0 ? (
              <p className="text-sm text-gray-400">No modules yet.</p>
            ) : (
              modules.map((mod, idx) => (
                <button
                  key={mod.id}
                  onClick={() => setSelectedModuleIdx(idx)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition ${
                    idx === selectedModuleIdx
                      ? "bg-[#b8933a]/10 text-[#b8933a] border border-[#b8933a]/30"
                      : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5"
                  }`}
                >
                  {isModuleDone(mod.id) ? (
                    <CheckCircle size={14} className="text-green-500 flex-shrink-0" />
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-full border border-current flex-shrink-0" />
                  )}
                  <span className="truncate">{mod.title}</span>
                </button>
              ))
            )}
          </div>
          {/* Module content */}
          <div className="lg:col-span-3">
            {module ? (
              <div className={CARD + " space-y-4"}>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900 dark:text-white">{module.title}</h3>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400">
                    {module.type} • {module.durationMins}m
                  </span>
                </div>
                {module.type === "video" && module.videoUrl && (
                  <div className="aspect-video bg-black rounded-lg overflow-hidden">
                    <iframe src={module.videoUrl} className="w-full h-full" allowFullScreen />
                  </div>
                )}
                {module.type === "text" && (
                  <div className="prose prose-sm dark:prose-invert max-w-none text-gray-700 dark:text-gray-300">
                    <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{module.content}</pre>
                  </div>
                )}
                {module.type === "checklist" && module.checklistItems && (
                  <ul className="space-y-2">
                    {module.checklistItems.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <CheckSquare size={16} className="mt-0.5 flex-shrink-0 text-[#b8933a]" />
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex justify-between items-center border-t border-gray-100 dark:border-white/5 pt-3">
                  <button
                    disabled={selectedModuleIdx === 0}
                    onClick={() => setSelectedModuleIdx((i) => i - 1)}
                    className={BTN_GHOST + " text-sm disabled:opacity-40"}
                  >
                    <ChevronLeft size={14} /> Previous
                  </button>
                  {!isModuleDone(module.id) && (
                    <button onClick={() => markModuleDone(module.id)} className={BTN_AMBER}>
                      <CheckCircle size={14} /> Mark Complete
                    </button>
                  )}
                  <button
                    disabled={selectedModuleIdx === modules.length - 1}
                    onClick={() => setSelectedModuleIdx((i) => i + 1)}
                    className={BTN_GHOST + " text-sm disabled:opacity-40"}
                  >
                    Next <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400">Select a module to begin.</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (view === "courses") {
    return (
      <div className="space-y-4">
        <button onClick={() => setView("home")} className={BTN_GHOST + " text-sm"}>
          <ArrowLeft size={14} /> Back
        </button>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Training Courses</h2>
        {coursesLoading ? (
          <div className="text-gray-400 text-sm flex items-center gap-2">
            <Loader size={14} className="animate-spin" /> Loading…
          </div>
        ) : courses.length === 0 ? (
          <p className="text-sm text-gray-400">No courses available yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {courses.map((course) => {
              const prog = getCourseProgress(course.id);
              return (
                <div
                  key={course.id}
                  onClick={() => {
                    setSelectedCourseId(course.id);
                    setSelectedModuleIdx(0);
                    setView("course");
                  }}
                  className={CARD + " cursor-pointer hover:border-[#b8933a]/30 transition group"}
                >
                  <div className="text-2xl mb-2">{course.icon}</div>
                  <h3 className="font-semibold text-gray-900 dark:text-white text-sm">{course.title}</h3>
                  <p className="text-xs text-gray-400 mt-1 line-clamp-2">{course.description}</p>
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                      <span>{prog}% complete</span>
                      <span>{course.estimatedHours}h</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-[#b8933a] rounded-full transition-all" style={{ width: `${prog}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Home view
  return (
    <SimulationHomeView
      repId={repId}
      onGoRoleplay={() => setView("roleplay")}
      onGoCourses={() => setView("courses")}
      onGoHistory={() => setView("history")}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Simulation Home View — with resume session, last score, recommendations
// ─────────────────────────────────────────────────────────────────────────────

function SimulationHomeView({
  repId,
  onGoRoleplay,
  onGoCourses,
  onGoHistory,
}: {
  repId: number;
  onGoRoleplay: () => void;
  onGoCourses: () => void;
  onGoHistory: () => void;
}) {
  const [lastSession, setLastSession] = useState<{
    id: string;
    scenarioType: string;
    difficulty: string;
    score: { total: number };
    completedAt: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "trainingSessions"), orderBy("completedAt", "desc"), limit(1));
    const unsub = onSnapshot(
      q,
      (snap) => {
        if (!snap.empty) {
          const d = snap.docs[0].data();
          if (d.repId === repId) {
            setLastSession({
              id: snap.docs[0].id,
              scenarioType: d.scenarioType ?? "unknown",
              difficulty: d.difficulty ?? "medium",
              score: d.score ?? { total: 0 },
              completedAt: d.completedAt ?? 0,
            });
          }
        }
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, [repId]);

  const SCENARIO_LABELS: Record<string, string> = {
    booking_call: "Booking Call",
    door_knock: "Door Knock",
    first_consult: "First Consult",
    follow_up: "Follow Up",
    property_sale: "Property Sale",
  };

  const lastScore = lastSession?.score?.total ?? 0;
  const lastScorePct = Math.round((lastScore / 40) * 100);
  const scoreColor = lastScorePct >= 75 ? "text-green-500" : lastScorePct >= 50 ? "text-amber-500" : "text-red-500";
  const scoreBg =
    lastScorePct >= 75
      ? "bg-green-100 dark:bg-green-900/20"
      : lastScorePct >= 50
        ? "bg-amber-100 dark:bg-amber-900/20"
        : "bg-red-100 dark:bg-red-900/20";

  // Recommended: if last score < 28, recommend easy; if >= 28, recommend medium
  const recommendedDifficulty = lastScore < 28 ? "easy" : lastScore < 34 ? "medium" : "hard";
  const recommendedScenario = lastSession?.scenarioType ?? "booking_call";

  return (
    <div className="space-y-6">
      {/* Resume Last Session */}
      {lastSession && !loading && (
        <div className="bg-white dark:bg-[#16161A] rounded-xl border border-gray-200 dark:border-white/[0.06] p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                Last Session
              </p>
              <h3 className="font-bold text-gray-900 dark:text-white text-base">
                {SCENARIO_LABELS[lastSession.scenarioType] ?? lastSession.scenarioType}
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                {lastSession.difficulty.charAt(0).toUpperCase() + lastSession.difficulty.slice(1)} difficulty ·{" "}
                {timeAgoStr(lastSession.completedAt)}
              </p>
            </div>
            <div className={`px-3 py-2 rounded-lg ${scoreBg} text-center`}>
              <p className={`text-xl font-bold ${scoreColor}`}>{lastScore}/40</p>
              <p className="text-[10px] text-gray-400">{lastScorePct}%</p>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={onGoRoleplay} className={BTN_AMBER + " flex-1 justify-center"}>
              <Mic size={14} /> New Session
            </button>
            <button onClick={onGoHistory} className={BTN_GHOST + " flex-1 justify-center"}>
              <Eye size={14} /> View Details
            </button>
          </div>
        </div>
      )}

      {/* Recommended Training */}
      <div className="bg-white dark:bg-[#16161A] rounded-xl border border-gray-200 dark:border-white/[0.06] p-5">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
          Recommended for You
        </p>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center text-purple-600 dark:text-purple-400">
            <Target size={18} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {SCENARIO_LABELS[recommendedScenario] ?? "Booking Call"} —{" "}
              {recommendedDifficulty.charAt(0).toUpperCase() + recommendedDifficulty.slice(1)}
            </p>
            <p className="text-xs text-gray-400">
              {lastScore < 28
                ? "Your last score suggests starting with an easier scenario to build fundamentals."
                : lastScore < 34
                  ? "You're progressing well — try medium difficulty to strengthen your technique."
                  : "You're scoring strongly — challenge yourself with hard mode."}
            </p>
          </div>
          <button onClick={onGoRoleplay} className={BTN_GHOST + " flex-shrink-0"}>
            <Play size={12} /> Start
          </button>
        </div>
      </div>

      {/* Main entry cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          onClick={onGoRoleplay}
          className="group p-6 rounded-xl border-2 border-dashed border-[#b8933a]/40 hover:border-[#b8933a] hover:bg-[#b8933a]/5 transition text-left"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-xl bg-[#b8933a]/10 flex items-center justify-center text-[#b8933a] group-hover:bg-[#b8933a]/20 transition">
              <Mic size={24} />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white">AI Roleplay</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Practice sales scenarios with AI</p>
            </div>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Simulate real conversations with AI client personas. Get scored feedback on objection handling, questioning,
            and closing.
          </p>
          <div className="mt-4 flex items-center gap-2 text-[#b8933a] text-sm font-medium">
            <Play size={14} /> Start Practice Session
          </div>
        </button>

        <button
          onClick={onGoCourses}
          className="group p-6 rounded-xl border-2 border-dashed border-blue-400/40 hover:border-blue-500 hover:bg-blue-50/5 transition text-left"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 dark:text-blue-400 group-hover:bg-blue-200 dark:group-hover:bg-blue-900/30 transition">
              <GraduationCap size={24} />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white">Courses</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Structured learning modules</p>
            </div>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Work through structured training courses covering scripts, sales technique, product knowledge, and
            compliance.
          </p>
          <div className="mt-4 flex items-center gap-2 text-blue-600 dark:text-blue-400 text-sm font-medium">
            <BookOpen size={14} /> Browse Courses
          </div>
        </button>
      </div>

      <button
        onClick={onGoHistory}
        className="w-full flex items-center justify-between p-4 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 hover:border-[#b8933a]/30 transition"
      >
        <div className="flex items-center gap-3">
          <TrendingUp size={18} className="text-[#b8933a]" />
          <div className="text-left">
            <p className="font-medium text-sm text-gray-900 dark:text-white">Session History</p>
            <p className="text-xs text-gray-400">View past roleplay scores and feedback</p>
          </div>
        </div>
        <ChevronRight size={16} className="text-gray-400" />
      </button>
    </div>
  );
}

function timeAgoStr(ms: number): string {
  if (!ms) return "";
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Export
// ─────────────────────────────────────────────────────────────────────────────

type HubTab = "simulation" | "documents" | "videos" | "recordings";

export function TrainingHubPage() {
  const { currentUser, reps } = useAppStore();
  const [tab, setTab] = useState<HubTab>("simulation");
  const [selectedScenario, setSelectedScenario] = useState<TrainingScenario | null>(null);

  // Listen for scenario launch events from AICoachingPanel in Knowledge Base
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      const scenario = TRAINING_SCENARIOS.find((s) => s.id === detail);
      if (scenario) {
        setSelectedScenario(scenario);
        setTab("simulation");
      }
    };
    window.addEventListener("launch-scenario", handler);
    return () => window.removeEventListener("launch-scenario", handler);
  }, []);

  if (!currentUser) return null;

  const userId = String(currentUser.id);
  const repId = currentUser.id;
  const repName = currentUser.name;

  const TABS: Array<{ id: HubTab; label: string; icon: React.ReactNode }> = [
    { id: "simulation", label: "Simulation", icon: <Mic size={14} /> },
    { id: "documents", label: "Documents", icon: <FileText size={14} /> },
    { id: "videos", label: "Videos", icon: <Video size={14} /> },
    { id: "recordings", label: "Recordings", icon: <FileAudio size={14} /> },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <GraduationCap size={24} className="text-[#b8933a]" />
            Training Hub
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Practice, learn, and access all training resources in one place.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1 scrollbar-none">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 flex-shrink-0 ${tab === t.id ? TAB_ACTIVE : TAB_INACTIVE}`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {tab === "simulation" && <SimulationTab userId={userId} repId={repId} />}
        {tab === "documents" && <DocumentsTab repId={repId} repName={repName} />}
        {tab === "videos" && <VideosTab repId={repId} repName={repName} />}
        {tab === "recordings" && <RecordingsTab repId={repId} reps={reps.map((r) => ({ id: r.id, name: r.name }))} />}
      </div>
    </div>
  );
}
