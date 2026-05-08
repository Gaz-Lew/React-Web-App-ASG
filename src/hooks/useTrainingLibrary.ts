/**
 * useTrainingLibrary.ts — Firestore hooks for Training Hub document/video/recording libraries
 *
 * Collections:
 *  - trainingDocuments — uploaded PDFs, DOCX
 *  - trainingVideos    — YouTube embeds or uploaded videos
 *  - trainingRecordings — linked AI roleplay session recordings
 */

import { useState, useEffect, useCallback } from "react";
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useFirebaseAuthUser } from "./useFirebaseAuthUser";
import { uploadFile, deleteFile } from "../lib/storage";
import type { TrainingDocument, TrainingVideo, TrainingRecording } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Training Documents
// ─────────────────────────────────────────────────────────────────────────────

export function useTrainingDocuments() {
  const { currentUser, authLoading } = useFirebaseAuthUser();
  const [documents, setDocuments] = useState<TrainingDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!currentUser) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(collection(db, "trainingDocuments"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setDocuments(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as TrainingDocument));
        setLoading(false);
      },
      (err) => {
        console.error("[useTrainingDocuments] Firestore error:", err);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [authLoading, currentUser]);

  return { documents, loading };
}

export function useSaveTrainingDocument() {
  const [saving, setSaving] = useState(false);

  const upload = useCallback(
    async (
      file: File,
      meta: Omit<TrainingDocument, "id" | "fileUrl" | "storagePath" | "fileType" | "fileSize" | "createdAt">,
    ): Promise<string> => {
      setSaving(true);
      try {
        const path = `training/documents/${Date.now()}_${file.name.replace(/\s+/g, "_")}`;
        const url = await uploadFile(path, file);
        const ref = await addDoc(collection(db, "trainingDocuments"), {
          ...meta,
          fileUrl: url,
          storagePath: path,
          fileType: file.type,
          fileSize: file.size,
          createdAt: Date.now(),
          pinnedByReps: [],
        });
        return ref.id;
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  const update = useCallback(async (id: string, data: Partial<TrainingDocument>) => {
    await updateDoc(doc(db, "trainingDocuments", id), data as Record<string, unknown>);
  }, []);

  return { upload, update, saving };
}

export function useDeleteTrainingDocument() {
  const remove = useCallback(async (document: TrainingDocument) => {
    if (document.storagePath) {
      await deleteFile(document.storagePath).catch(() => {});
    }
    await deleteDoc(doc(db, "trainingDocuments", document.id));
  }, []);
  return { remove };
}

export function usePinTrainingDocument() {
  const pin = useCallback(async (docId: string, repId: number) => {
    await updateDoc(doc(db, "trainingDocuments", docId), {
      pinnedByReps: arrayUnion(repId),
    });
  }, []);

  const unpin = useCallback(async (docId: string, repId: number) => {
    await updateDoc(doc(db, "trainingDocuments", docId), {
      pinnedByReps: arrayRemove(repId),
    });
  }, []);

  return { pin, unpin };
}

// ─────────────────────────────────────────────────────────────────────────────
// Training Videos
// ─────────────────────────────────────────────────────────────────────────────

export function useTrainingVideos() {
  const { currentUser, authLoading } = useFirebaseAuthUser();
  const [videos, setVideos] = useState<TrainingVideo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!currentUser) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(collection(db, "trainingVideos"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setVideos(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as TrainingVideo));
        setLoading(false);
      },
      (err) => {
        console.error("[useTrainingVideos] Firestore error:", err);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [authLoading, currentUser]);

  return { videos, loading };
}

export function useSaveTrainingVideo() {
  const [saving, setSaving] = useState(false);

  const save = useCallback(
    async (
      data: Omit<TrainingVideo, "id" | "createdAt">,
      videoFile?: File,
    ): Promise<string> => {
      setSaving(true);
      try {
        let videoUrl = data.videoUrl;
        if (videoFile) {
          const path = `training/videos/${Date.now()}_${videoFile.name.replace(/\s+/g, "_")}`;
          videoUrl = await uploadFile(path, videoFile);
        }
        const ref = await addDoc(collection(db, "trainingVideos"), {
          ...data,
          videoUrl,
          createdAt: Date.now(),
          pinnedByReps: [],
        });
        return ref.id;
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  const update = useCallback(async (id: string, data: Partial<TrainingVideo>) => {
    await updateDoc(doc(db, "trainingVideos", id), data as Record<string, unknown>);
  }, []);

  return { save, update, saving };
}

export function useDeleteTrainingVideo() {
  const remove = useCallback(async (video: TrainingVideo) => {
    await deleteDoc(doc(db, "trainingVideos", video.id));
  }, []);
  return { remove };
}

export function usePinTrainingVideo() {
  const pin = useCallback(async (videoId: string, repId: number) => {
    await updateDoc(doc(db, "trainingVideos", videoId), {
      pinnedByReps: arrayUnion(repId),
    });
  }, []);

  const unpin = useCallback(async (videoId: string, repId: number) => {
    await updateDoc(doc(db, "trainingVideos", videoId), {
      pinnedByReps: arrayRemove(repId),
    });
  }, []);

  return { pin, unpin };
}

// ─────────────────────────────────────────────────────────────────────────────
// Training Recordings (linked to AI roleplay sessions)
// ─────────────────────────────────────────────────────────────────────────────

export function useTrainingRecordings(repId?: number) {
  const { currentUser, authLoading } = useFirebaseAuthUser();
  const [recordings, setRecordings] = useState<TrainingRecording[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!currentUser) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(collection(db, "trainingRecordings"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        let all = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as TrainingRecording);
        if (repId !== undefined) {
          all = all.filter((r) => r.repId === repId);
        }
        setRecordings(all);
        setLoading(false);
      },
      (err) => {
        console.error("[useTrainingRecordings] Firestore error:", err);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [authLoading, currentUser, repId]);

  return { recordings, loading };
}

export function useSaveTrainingRecording() {
  const save = useCallback(async (data: Omit<TrainingRecording, "id">): Promise<string> => {
    const ref = await addDoc(collection(db, "trainingRecordings"), data);
    return ref.id;
  }, []);
  return { save };
}

export function useDeleteTrainingRecording() {
  const remove = useCallback(async (recording: TrainingRecording) => {
    if (recording.storagePath) {
      await deleteFile(recording.storagePath).catch(() => {});
    }
    await deleteDoc(doc(db, "trainingRecordings", recording.id));
  }, []);
  return { remove };
}
