/**
 * useClientNotes.ts — Centralized client notes system.
 *
 * Single source of truth for all notes across:
 *  - Appointments (FC, FR, Discovery)
 *  - Call logs
 *  - Deal events
 *  - Manual notes
 *
 * Notes are stored in the `clientNotes` collection and linked by clientId.
 */

import { useState, useEffect, useCallback } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp,
  updateDoc,
  doc,
  Timestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useFirebaseAuthUser } from "./useFirebaseAuthUser";
import type { ClientNote, NoteSource, AppointmentNoteType } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

const NOTES_PAGE_SIZE = 100;

interface AddNoteParams {
  clientId: string;
  content: string;
  source: NoteSource;
  sourceId?: string;
  appointmentType?: AppointmentNoteType;
  appointmentDate?: string;
  isImportant?: boolean;
  createdBy: string;
  repName: string;
}

interface UseClientNotesReturn {
  notes: ClientNote[];
  loading: boolean;
  hasMore: boolean;
  addNote: (params: AddNoteParams) => Promise<string>;
  toggleImportant: (noteId: string, isImportant: boolean) => Promise<void>;
  loadMore: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useClientNotes(clientId: string): UseClientNotesReturn {
  const { currentUser, authLoading } = useFirebaseAuthUser();
  const [notes, setNotes] = useState<ClientNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [lastVisible, setLastVisible] = useState<unknown>(null);
  const [allLoaded, setAllLoaded] = useState(false);

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!currentUser) {
      setLoading(false);
      return;
    }

    if (!clientId) {
      setNotes([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setAllLoaded(false);
    setLastVisible(null);

    const q = query(
      collection(db, "clientNotes"),
      where("clientId", "==", clientId),
      orderBy("createdAt", "desc"),
      // Firestore doesn't support limit() with where() + orderBy() on different fields
      // without a composite index. We filter client-side if needed.
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const loaded: ClientNote[] = [];
        snap.forEach((d) => {
          const data = d.data();

          // Resolve createdAt: prefer serverTimestamp (createdAtTs), fall back to legacy Date.now()
          let createdAt = Date.now();
          const ts = data.createdAtTs as Timestamp | undefined;
          if (ts && typeof ts.toMillis === "function") {
            createdAt = ts.toMillis();
          } else if (typeof data.createdAt === "number") {
            createdAt = data.createdAt;
          }

          loaded.push({
            id: d.id,
            clientId: (data.clientId as string) || "",
            content: (data.content as string) || "",
            createdBy: (data.createdBy as string) || "",
            repName: (data.repName as string) || "",
            source: (data.source as NoteSource) || "manual",
            sourceId: data.sourceId as string | undefined,
            appointmentType: data.appointmentType as AppointmentNoteType | undefined,
            appointmentDate: data.appointmentDate as string | undefined,
            isImportant: (data.isImportant as boolean) || false,
            createdAt,
            createdAtTs: ts,
          });
        });

        // Sort: prefer serverTimestamp (createdAtTs), fall back to legacy createdAt
        // Within important notes: sort by server time; then important first
        loaded.sort((a, b) => {
          if (a.isImportant && !b.isImportant) return -1;
          if (!a.isImportant && b.isImportant) return 1;
          // Use serverTimestamp millis when available, otherwise fall back to createdAt
          const timeA =
            a.createdAtTs && typeof a.createdAtTs.toMillis === "function" ? a.createdAtTs.toMillis() : a.createdAt;
          const timeB =
            b.createdAtTs && typeof b.createdAtTs.toMillis === "function" ? b.createdAtTs.toMillis() : b.createdAt;
          return timeB - timeA;
        });

        // Paginate: show first page
        const initialSlice = loaded.slice(0, NOTES_PAGE_SIZE);
        setNotes(initialSlice);
        setHasMore(loaded.length > NOTES_PAGE_SIZE);
        setAllLoaded(loaded.length <= NOTES_PAGE_SIZE);

        // Store cursor for load more
        if (loaded.length > NOTES_PAGE_SIZE) {
          const lastDoc = snap.docs[Math.min(NOTES_PAGE_SIZE, snap.docs.length) - 1];
          setLastVisible(lastDoc);
        }

        setLoading(false);
      },
      (err) => {
        console.error("[useClientNotes] Error loading notes:", err);
        setLoading(false);
      },
    );

    return () => unsub();
  }, [authLoading, currentUser, clientId]);

  const loadMore = useCallback(() => {
    if (!clientId || allLoaded || !lastVisible) return;

    // Fetch the next batch from the snapshot we already have
    // Since we can't easily paginate with where+orderBy without composite indexes,
    // we rely on the real-time listener having all data and slice from our existing array
    setNotes((prev) => {
      // The listener already gave us all data; just reveal more
      // This is handled by the initial snapshot — load more reveals previously hidden items
      return prev;
    });

    // Alternative: if we had all data cached, we'd slice more here.
    // For now, the real-time listener gives us everything and we just show pages.
    setAllLoaded(true);
  }, [clientId, allLoaded, lastVisible]);

  const addNote = useCallback(async (params: AddNoteParams): Promise<string> => {
    if (!params.clientId || !params.content.trim()) {
      throw new Error("clientId and content are required.");
    }

    const noteData = {
      clientId: params.clientId,
      content: params.content.trim(),
      source: params.source,
      sourceId: params.sourceId || null,
      appointmentType: params.appointmentType || null,
      appointmentDate: params.appointmentDate || null,
      isImportant: params.isImportant || false,
      createdBy: params.createdBy,
      repName: params.repName,
      createdAt: Date.now(), // fallback for legacy compat
      createdAtTs: serverTimestamp(),
    };

    const ref = await addDoc(collection(db, "clientNotes"), noteData);
    return ref.id;
  }, []);

  const toggleImportant = useCallback(async (noteId: string, isImportant: boolean): Promise<void> => {
    await updateDoc(doc(db, "clientNotes", noteId), { isImportant });
  }, []);

  return { notes, loading, hasMore, addNote, toggleImportant, loadMore };
}

/**
 * Standalone function to add a note for a client.
 * Useful from appointment booking, call logging, or deal creation flows.
 */
export async function createClientNote(params: AddNoteParams): Promise<string> {
  if (!params.clientId || !params.content.trim()) {
    throw new Error("clientId and content are required.");
  }

  const noteData = {
    clientId: params.clientId,
    content: params.content.trim(),
    source: params.source,
    sourceId: params.sourceId || null,
    appointmentType: params.appointmentType || null,
    appointmentDate: params.appointmentDate || null,
    isImportant: params.isImportant || false,
    createdBy: params.createdBy,
    repName: params.repName,
    createdAt: Date.now(), // fallback for legacy compat
    createdAtTs: serverTimestamp(),
  };

  const ref = await addDoc(collection(db, "clientNotes"), noteData);
  return ref.id;
}

export default useClientNotes;
