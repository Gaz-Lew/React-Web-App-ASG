/**
 * Custom Firebase Hooks
 *
 * Wraps Firestore operations with React state management:
 * - useLeads()          → real-time leads listener
 * - useSaveLead()       → save/update a lead
 * - useDeleteLead()     → delete a lead
 * - useCreateDeal()     → create a deal document when a lead is booked
 * - useDraps()          → real-time DRAPS listener
 * - useSaveDraps()      → save a DRAPS entry
 * - useDeleteDraps()    → delete a DRAPS entry
 * - useCommissions()    → real-time commissions listener
 * - useSaveCommission() → save a commission entry
 * - useDeleteCommission() → delete a commission entry
 * - useAuditLog()       → real-time audit log listener
 * - useAddAuditEntry()  → add audit log entry
 * - useKnockZones()     → real-time knock zone listener
 * - useSaveKnockZone()  → save a knock zone
 * - useDeleteKnockZone() → delete a knock zone
 * - useAppSettings()    → real-time settings/main doc listener
 * - useSaveSettings()   → merge-write to settings/main
 * - useTrainingSessions() → real-time listener for trainingSessions collection (AI Roleplay)
 */

import { useState, useEffect, useCallback } from "react";
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  addDoc,
  orderBy,
  query,
  limit,
  updateDoc,
  increment,
  getDocs,
  writeBatch,
  getDoc,
  where,
} from "firebase/firestore";
import { db, authReady } from "../lib/firebase";
import { useAppStore } from "../stores/appStore";
import { DEFAULT_STATUS_COLORS } from "../types";
import {
  Lead,
  Rep,
  DrapsEntry,
  CommissionEntry,
  AuditEntry,
  InvoiceDraft,
  KnockZone,
  CustomPinType,
  AppSettings,
  ChatMessage,
  KBArticle,
  LibraryDocument,
  LeadFile,
  FormTemplate,
  DealUpdate,
  ServiceType,
  Appointment,
  LeadNote,
  RoleplaySession,
  DailyStats,
  UserDevice,
  DealDocument,
  DealDocumentType,
} from "../types";
import { deleteFile, uploadFile } from "../lib/storage";

// Firestore rejects `undefined` field values — strip them before writing (deep: handles nested objects + arrays)
function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [
        k,
        Array.isArray(v)
          ? v.map((item) => (item && typeof item === "object" ? stripUndefined(item as object) : item))
          : v && typeof v === "object"
            ? stripUndefined(v as object)
            : v,
      ]),
  ) as Partial<T>;
}

// ── Leads ─────────────────────────────────────────────────────────────────────

export function useLeads() {
  const { setLeads: setStoreLeads } = useAppStore();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unsubFirestore: (() => void) | null = null;
    let cancelled = false;

    // Wait for Firebase Auth to be ready before subscribing — prevents
    // "Missing or insufficient permissions" errors caused by unauthenticated queries.
    authReady.then(() => {
      if (cancelled) return;

      const q = collection(db, "leads");
      unsubFirestore = onSnapshot(
        q,
        (snapshot) => {
          const leadsData = snapshot.docs.map((d) => ({
            id: Number(d.id),
            ...d.data(),
          })) as Lead[];
          setLeads(leadsData);
          // Populate AppStore so DealDashboard, ReportsDashboard, etc. have data
          setStoreLeads(leadsData);
          setLoading(false);
        },
        (err) => {
          console.error("[useLeads] Firestore error:", err);
          setError(err.message);
          setLoading(false);
        },
      );
    });

    return () => {
      cancelled = true;
      unsubFirestore?.();
    };
  }, [setStoreLeads]);

  return { leads, loading, error };
}

export function useSaveLead() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (lead: Lead): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      await setDoc(doc(db, "leads", String(lead.id)), stripUndefined(lead), { merge: true });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Save failed";
      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  };

  return { save, loading, error };
}

export function useDeleteLead() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async (leadId: number): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const leadDocRef = doc(db, "leads", String(leadId));
      // Delete subcollections first
      const subcollections = ["presence", "files"];
      for (const sub of subcollections) {
        const subSnap = await getDocs(collection(db, "leads", String(leadId), sub));
        if (!subSnap.empty) {
          const batch = writeBatch(db);
          subSnap.docs.forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
      }
      // Delete the lead document itself
      await deleteDoc(leadDocRef);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Delete failed";
      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  };

  return { remove, loading, error };
}

// ── Create Deal (called when a lead is booked) ────────────────────────────────

export function useCreateDeal() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (params: {
    leadId: number;
    clientName: string;
    assignedTo: number;
    dealValue?: number;
  }): Promise<string | null> => {
    setLoading(true);
    setError(null);
    try {
      const now = Date.now();
      const dealRef = await addDoc(collection(db, "deals"), {
        clientName: params.clientName,
        status: "lead",
        dealValue: params.dealValue ?? 0,
        commissionTotal: 0,
        commissionPaid: 0,
        expectedSettlementDate: "",
        assignedTo: params.assignedTo,
        lastUpdate: now,
        notes: [],
        createdAt: now,
        createdBy: params.clientName,
        leadId: String(params.leadId),
      });

      // Sync guard — write dealId back to the lead document immediately so the
      // lead always points to its deal even if the calling component's onSave fails.
      try {
        await updateDoc(doc(db, "leads", String(params.leadId)), { dealId: dealRef.id });
      } catch (syncErr) {
        // Non-fatal — CallLogger will also write dealId via onSave. Log for visibility.
        console.warn("useCreateDeal: lead↔deal sync write failed (non-fatal)", syncErr);
      }

      return dealRef.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create deal";
      setError(message);
      console.error("useCreateDeal:", err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { create, loading, error };
}

// ── Reps ──────────────────────────────────────────────────────────────────────

/**
 * Syncs the Firestore `reps` collection to the Zustand store.
 * Doc IDs are the string version of the numeric rep.id.
 * Call once in AppShell so credentials (PIN, backupPassword, isSetup) set on
 * any device are immediately available on all other devices.
 */
export function useReps() {
  const { setReps } = useAppStore();
  useEffect(() => {
    let unsubFirestore: (() => void) | null = null;
    let cancelled = false;

    authReady.then(() => {
      if (cancelled) return;
      unsubFirestore = onSnapshot(
        collection(db, "reps"),
        (snapshot) => {
          if (snapshot.empty) return; // don't overwrite with empty — may not have migrated yet
          const data = snapshot.docs.map((d) => ({ ...d.data(), id: Number(d.id) })) as Rep[];
          setReps(data);
        },
        (err) => {
          console.warn("[useReps] Firestore error:", err.message);
        },
      );
    });

    return () => {
      cancelled = true;
      unsubFirestore?.();
    };
  }, [setReps]);
}

/** Writes a single rep to Firestore `reps/{id}` (merge). */
export function useSaveRep() {
  const save = async (rep: Rep): Promise<boolean> => {
    try {
      await setDoc(doc(db, "reps", String(rep.id)), stripUndefined(rep), { merge: true });
      return true;
    } catch (err) {
      console.error("useSaveRep:", err);
      return false;
    }
  };
  return { save };
}

/** Deletes a rep from Firestore `reps/{id}`. */
export function useDeleteRep() {
  const remove = async (repId: number): Promise<boolean> => {
    try {
      await deleteDoc(doc(db, "reps", String(repId)));
      return true;
    } catch (err) {
      console.error("useDeleteRep:", err);
      return false;
    }
  };
  return { remove };
}

// ── DRAPS ─────────────────────────────────────────────────────────────────────

export function useDraps() {
  const [entries, setEntries] = useState<DrapsEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, "draps"), orderBy("date", "desc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({ id: Number(d.id), ...d.data() })) as DrapsEntry[];
        setEntries(data);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, []);

  return { entries, loading, error };
}

export function useSaveDraps() {
  const save = async (entry: DrapsEntry): Promise<boolean> => {
    try {
      await setDoc(doc(db, "draps", String(entry.id)), entry);
      return true;
    } catch (err) {
      console.error("Save DRAPS error:", err);
      return false;
    }
  };
  return { save };
}

export function useDeleteDraps() {
  const remove = async (id: number): Promise<boolean> => {
    try {
      await deleteDoc(doc(db, "draps", String(id)));
      return true;
    } catch (err) {
      console.error("Delete DRAPS error:", err);
      return false;
    }
  };
  return { remove };
}

// ── Commissions ───────────────────────────────────────────────────────────────

export function useCommissions() {
  const [entries, setEntries] = useState<CommissionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, "commissions"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as CommissionEntry[];
        setEntries(data);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, []);

  return { entries, loading, error };
}

export function useSaveCommission() {
  const save = async (entry: CommissionEntry): Promise<boolean> => {
    try {
      // stripUndefined required — Firestore rejects undefined fields
      await setDoc(doc(db, "commissions", entry.id), stripUndefined(entry));
      return true;
    } catch (err) {
      console.error("Save commission error:", err);
      return false;
    }
  };
  return { save };
}

export function useDeleteCommission() {
  const remove = async (id: string): Promise<boolean> => {
    try {
      await deleteDoc(doc(db, "commissions", id));
      return true;
    } catch (err) {
      console.error("Delete commission error:", err);
      return false;
    }
  };
  return { remove };
}

// ── Invoice Drafts ────────────────────────────────────────────────────────────

export function useInvoiceDrafts() {
  const [drafts, setDrafts] = useState<InvoiceDraft[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "invoiceDrafts"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setDrafts(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as InvoiceDraft[]);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  return { drafts, loading };
}

export function useSaveInvoiceDraft() {
  const save = async (draft: InvoiceDraft): Promise<boolean> => {
    try {
      await setDoc(doc(db, "invoiceDrafts", draft.id), stripUndefined(draft));
      return true;
    } catch (err) {
      console.error("Save invoice draft error:", err);
      return false;
    }
  };
  return { save };
}

export function useDeleteInvoiceDraft() {
  const remove = async (id: string): Promise<boolean> => {
    try {
      await deleteDoc(doc(db, "invoiceDrafts", id));
      return true;
    } catch (err) {
      console.error("Delete invoice draft error:", err);
      return false;
    }
  };
  return { remove };
}

// ── Audit Log ─────────────────────────────────────────────────────────────────

export function useAuditLog(limitCount = 200) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "audit"), orderBy("timestamp", "desc"), limit(limitCount));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as AuditEntry[];
      setEntries(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [limitCount]);

  return { entries, loading };
}

export function useAddAuditEntry() {
  const add = async (entry: Omit<AuditEntry, "id">): Promise<void> => {
    try {
      await addDoc(collection(db, "audit"), entry);
    } catch (err) {
      console.error("Audit log error:", err);
    }
  };
  return { add };
}

// ── Knock Zones ───────────────────────────────────────────────────────────────

export function useKnockZones() {
  const [zones, setZones] = useState<KnockZone[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "knockZones"), orderBy("date", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((d) => ({ ...d.data() })) as KnockZone[];
      setZones(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  return { zones, loading };
}

export function useSaveKnockZone() {
  const save = async (zone: KnockZone): Promise<boolean> => {
    try {
      await setDoc(doc(db, "knockZones", zone.id), stripUndefined(zone));
      return true;
    } catch (err) {
      console.error("Save knock zone error:", err);
      return false;
    }
  };
  return { save };
}

export function useDeleteKnockZone() {
  const remove = async (id: string): Promise<boolean> => {
    try {
      await deleteDoc(doc(db, "knockZones", id));
      return true;
    } catch (err) {
      console.error("Delete knock zone error:", err);
      return false;
    }
  };
  return { remove };
}

// ── App Settings ──────────────────────────────────────────────────────────────

/** Real-time listener for the single `settings/main` doc */
export function useAppSettings(): { settings: AppSettings | null; loading: boolean } {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const setStatusColors = useAppStore((s) => s.setStatusColors);

  useEffect(() => {
    let unsubFirestore: (() => void) | null = null;
    let cancelled = false;

    authReady.then(() => {
      if (cancelled) return;
      unsubFirestore = onSnapshot(
        doc(db, "settings", "main"),
        (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.data() as AppSettings;
            setSettings(data);
            // Sync status colours into global store (merge with defaults so any missing key still shows)
            if (data.statusColors) {
              setStatusColors({ ...DEFAULT_STATUS_COLORS, ...data.statusColors });
            }
          } else {
            setSettings(null);
          }
          setLoading(false);
        },
        (err) => {
          console.error("[useAppSettings] Firestore error:", err);
          setLoading(false);
        },
      );
    });

    return () => {
      cancelled = true;
      unsubFirestore?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { settings, loading };
}

/** Merge-writes partial settings to `settings/main` */
export function useSaveSettings(): { save: (s: Partial<AppSettings>) => Promise<boolean> } {
  const save = async (s: Partial<AppSettings>): Promise<boolean> => {
    try {
      await setDoc(doc(db, "settings", "main"), stripUndefined(s), { merge: true });
      return true;
    } catch (err) {
      console.error("Save settings error:", err);
      return false;
    }
  };
  return { save };
}

// ── Custom Pin Types ──────────────────────────────────────────────────────────

export function useCustomPinTypes() {
  const [customPinTypes, setCustomPinTypes] = useState<CustomPinType[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const q = query(collection(db, "customPinTypes"), orderBy("createdAt", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((d) => ({ ...d.data() })) as CustomPinType[];
      setCustomPinTypes(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);
  return { customPinTypes, loading };
}

export function useSaveCustomPinType() {
  const save = async (pin: CustomPinType): Promise<boolean> => {
    try {
      await setDoc(doc(db, "customPinTypes", pin.id), stripUndefined(pin));
      return true;
    } catch (err) {
      console.error("Save custom pin type error:", err);
      return false;
    }
  };
  return { save };
}

export function useDeleteCustomPinType() {
  const remove = async (id: string): Promise<boolean> => {
    try {
      await deleteDoc(doc(db, "customPinTypes", id));
      return true;
    } catch (err) {
      console.error("Delete custom pin type error:", err);
      return false;
    }
  };
  return { remove };
}

// ── Team Chat ─────────────────────────────────────────────────────────────────

/** Real-time listener for the group chat channel (latest 150 messages, oldest first) */
export function useTeamChat(): { messages: ChatMessage[]; loading: boolean } {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "teamChat"), orderBy("timestamp", "asc"), limit(150));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as ChatMessage[];
        setMessages(data);
        setLoading(false);
      },
      (err) => {
        console.error("Team chat error:", err);
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, []);

  return { messages, loading };
}

/** Send a message to the group chat */
export function useSendChatMessage(): { send: (msg: Omit<ChatMessage, "id">) => Promise<void> } {
  const send = async (msg: Omit<ChatMessage, "id">): Promise<void> => {
    try {
      await addDoc(collection(db, "teamChat"), msg);
    } catch (err) {
      console.error("Send chat message error:", err);
    }
  };
  return { send };
}

/** Real-time listener for a DM channel sub-collection (latest 150 messages, oldest first) */
export function useDirectMessages(channelId: string): { messages: ChatMessage[]; loading: boolean } {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!channelId) return;
    const q = query(collection(db, "dmChannels", channelId, "messages"), orderBy("timestamp", "asc"), limit(150));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as ChatMessage[];
        setMessages(data);
        setLoading(false);
      },
      (err) => {
        console.error("DM channel error:", err);
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, [channelId]);

  return { messages, loading };
}

/** Send a message to a specific DM channel */
export function useSendDirectMessage(): { send: (channelId: string, msg: Omit<ChatMessage, "id">) => Promise<void> } {
  const send = async (channelId: string, msg: Omit<ChatMessage, "id">): Promise<void> => {
    try {
      await addDoc(collection(db, "dmChannels", channelId, "messages"), msg);
    } catch (err) {
      console.error("Send DM error:", err);
    }
  };
  return { send };
}

/** Toggle an emoji reaction on a group chat or DM message */
export function useToggleReaction() {
  const toggle = useCallback(
    async (messageId: string, emoji: string, repId: number, isDm: boolean, dmChannelId?: string): Promise<void> => {
      let msgRef;
      if (isDm && dmChannelId) {
        msgRef = doc(db, "dmChannels", dmChannelId, "messages", messageId);
      } else {
        msgRef = doc(db, "teamChat", messageId);
      }
      const snap = await getDoc(msgRef);
      if (!snap.exists()) return;
      const reactions: Record<string, number[]> = (snap.data()?.reactions as Record<string, number[]>) ?? {};
      const existing = reactions[emoji] ?? [];
      const alreadyReacted = existing.includes(repId);
      const updated = alreadyReacted ? existing.filter((id) => id !== repId) : [...existing, repId];
      if (updated.length === 0) {
        const { [emoji]: _removed, ...rest } = reactions;
        await updateDoc(msgRef, { reactions: rest });
      } else {
        await updateDoc(msgRef, { [`reactions.${emoji}`]: updated });
      }
    },
    [],
  );
  return { toggle };
}

// ── Knowledge Base hooks ────────────────────────────────────────────────────

export function useKBArticles(): { articles: KBArticle[]; loading: boolean } {
  const [articles, setArticles] = useState<KBArticle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Single-field orderBy avoids needing a composite Firestore index.
    // Pinned-first sort is done client-side after the snapshot arrives.
    const q = query(collection(db, "knowledgeBase"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const raw = snap.docs.map((d) => ({ ...d.data(), id: d.id }) as KBArticle);
        // Sort: pinned first, then by createdAt desc
        raw.sort((a, b) => {
          if (a.pinned && !b.pinned) return -1;
          if (!a.pinned && b.pinned) return 1;
          return b.createdAt - a.createdAt;
        });
        setArticles(raw);
        setLoading(false);
      },
      (err) => {
        console.error("useKBArticles error:", err);
        setLoading(false);
      },
    );
    return () => unsub();
  }, []);

  return { articles, loading };
}

export function useSaveKBArticle(): { save: (article: KBArticle) => Promise<boolean> } {
  const save = async (article: KBArticle): Promise<boolean> => {
    try {
      await setDoc(doc(db, "knowledgeBase", article.id), stripUndefined(article), { merge: true });
      return true;
    } catch {
      return false;
    }
  };
  return { save };
}

export function useDeleteKBArticle(): { remove: (id: string) => Promise<boolean> } {
  const remove = async (id: string): Promise<boolean> => {
    try {
      await deleteDoc(doc(db, "knowledgeBase", id));
      return true;
    } catch {
      return false;
    }
  };
  return { remove };
}

export function useIncrementKBViews(): { increment: (id: string) => Promise<void> } {
  const incrementViews = async (id: string): Promise<void> => {
    try {
      await updateDoc(doc(db, "knowledgeBase", id), { views: increment(1) });
    } catch {
      /* ignore */
    }
  };
  return { increment: incrementViews };
}

// ── Document Library hooks ──────────────────────────────────────────────────

export function useDocumentLibrary(): { documents: LibraryDocument[]; loading: boolean } {
  const [documents, setDocuments] = useState<LibraryDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "documentLibrary"), orderBy("uploadedAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const raw = snap.docs.map((d) => ({ ...d.data(), id: d.id }) as LibraryDocument);
        // Respect explicit sortOrder when any item has it set; otherwise keep uploadedAt desc
        const hasSortOrder = raw.some((d) => d.sortOrder !== undefined);
        if (hasSortOrder) {
          raw.sort((a, b) => {
            const ao = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
            const bo = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
            return ao !== bo ? ao - bo : (b.uploadedAt ?? 0) - (a.uploadedAt ?? 0);
          });
        }
        setDocuments(raw);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, []);

  return { documents, loading };
}

export function useSaveLibraryDocument(): { save: (doc_: LibraryDocument) => Promise<boolean> } {
  const save = async (doc_: LibraryDocument): Promise<boolean> => {
    try {
      await setDoc(doc(db, "documentLibrary", doc_.id), stripUndefined(doc_), { merge: true });
      return true;
    } catch {
      return false;
    }
  };
  return { save };
}

export function useDeleteLibraryDocument(): { remove: (doc_: LibraryDocument) => Promise<boolean> } {
  const remove = async (doc_: LibraryDocument): Promise<boolean> => {
    try {
      await deleteDoc(doc(db, "documentLibrary", doc_.id));
      if (doc_.storagePath) await deleteFile(doc_.storagePath);
      return true;
    } catch {
      return false;
    }
  };
  return { remove };
}

// ── Lead File hooks ─────────────────────────────────────────────────────────

export function useLeadFiles(leadId: string): { files: LeadFile[]; loading: boolean } {
  const [files, setFiles] = useState<LeadFile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!leadId) {
      setLoading(false);
      return;
    }
    const q = query(collection(db, "leads", leadId, "files"), orderBy("uploadedAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setFiles(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as LeadFile));
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, [leadId]);

  return { files, loading };
}

export function useDeleteLeadFile(): { remove: (leadId: string, file: LeadFile) => Promise<boolean> } {
  const remove = async (leadId: string, file: LeadFile): Promise<boolean> => {
    try {
      await deleteDoc(doc(db, "leads", leadId, "files", file.id));
      if (file.storagePath) await deleteFile(file.storagePath);
      return true;
    } catch {
      return false;
    }
  };
  return { remove };
}

// ── Form Template hooks ──────────────────────────────────────────────────────

export function useFormTemplates(): { templates: FormTemplate[]; loading: boolean } {
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "formTemplates"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const raw = snap.docs.map((d) => ({ ...d.data(), id: d.id }) as FormTemplate);
        // Respect explicit sortOrder when any item has it set; otherwise keep createdAt desc
        const hasSortOrder = raw.some((t) => t.sortOrder !== undefined);
        if (hasSortOrder) {
          raw.sort((a, b) => {
            const ao = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
            const bo = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
            return ao !== bo ? ao - bo : (b.createdAt ?? 0) - (a.createdAt ?? 0);
          });
        }
        setTemplates(raw);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, []);

  return { templates, loading };
}

export function useSaveFormTemplate(): { save: (t: FormTemplate) => Promise<boolean> } {
  const save = async (t: FormTemplate): Promise<boolean> => {
    try {
      await setDoc(doc(db, "formTemplates", t.id), stripUndefined(t), { merge: true });
      return true;
    } catch {
      return false;
    }
  };
  return { save };
}

export function useDeleteFormTemplate(): { remove: (id: string) => Promise<boolean> } {
  const remove = async (id: string): Promise<boolean> => {
    try {
      await deleteDoc(doc(db, "formTemplates", id));
      return true;
    } catch {
      return false;
    }
  };
  return { remove };
}

// ── Deal Update hooks (per-lead message board) ────────────────────────────────

export function useDealUpdates(leadId: number | null): { updates: DealUpdate[]; loading: boolean } {
  const [updates, setUpdates] = useState<DealUpdate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!leadId) {
      setLoading(false);
      return;
    }
    const q = query(collection(db, "leads", String(leadId), "dealUpdates"), orderBy("timestamp", "asc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setUpdates(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as DealUpdate));
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, [leadId]);

  return { updates, loading };
}

export function useAddDealUpdate(): { add: (leadId: number, update: Omit<DealUpdate, "id">) => Promise<boolean> } {
  const add = async (leadId: number, update: Omit<DealUpdate, "id">): Promise<boolean> => {
    try {
      await addDoc(collection(db, "leads", String(leadId), "dealUpdates"), stripUndefined(update as object));
      return true;
    } catch (e) {
      console.error("addDealUpdate failed", e);
      return false;
    }
  };
  return { add };
}

// ── Calendar: Service Types ─────────────────────────────────────────────────

export function useServiceTypes(): { serviceTypes: ServiceType[]; loading: boolean } {
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "calendarServiceTypes"), orderBy("sortOrder", "asc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const raw = snap.docs.map((d) => ({ ...d.data(), id: d.id }) as ServiceType);
        // Client-side sort fallback in case sortOrder is missing on some docs
        raw.sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
        setServiceTypes(raw);
        setLoading(false);
      },
      (err) => {
        console.error("useServiceTypes error:", err);
        setLoading(false);
      },
    );
    return () => unsub();
  }, []);

  return { serviceTypes, loading };
}

export function useSaveServiceType(): { save: (st: ServiceType) => Promise<boolean> } {
  const save = async (st: ServiceType): Promise<boolean> => {
    try {
      await setDoc(doc(db, "calendarServiceTypes", st.id), stripUndefined(st), { merge: true });
      return true;
    } catch (e) {
      console.error("useSaveServiceType error:", e);
      return false;
    }
  };
  return { save };
}

export function useDeleteServiceType(): { remove: (id: string) => Promise<boolean> } {
  const remove = async (id: string): Promise<boolean> => {
    try {
      await deleteDoc(doc(db, "calendarServiceTypes", id));
      return true;
    } catch (e) {
      console.error("useDeleteServiceType error:", e);
      return false;
    }
  };
  return { remove };
}

// ── Calendar: Appointments ──────────────────────────────────────────────────

export function useAppointments(dateRange?: { from: string; to: string }): {
  appointments: Appointment[];
  loading: boolean;
} {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  // Default: today → today + 59 days
  const today = new Date().toISOString().split("T")[0];
  const defaultTo = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 59);
    return d.toISOString().split("T")[0];
  })();

  const from = dateRange?.from ?? today;
  const to = dateRange?.to ?? defaultTo;

  useEffect(() => {
    // Order by date + startTime; client-side date range filter avoids
    // complex Firestore range query composite index requirements
    const q = query(collection(db, "appointments"), orderBy("date", "asc"), orderBy("startTime", "asc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const all = snap.docs.map((d) => ({ ...d.data(), id: d.id }) as Appointment);
        setAppointments(all.filter((a) => a.date >= from && a.date <= to));
        setLoading(false);
      },
      (err) => {
        console.error("useAppointments error:", err);
        setLoading(false);
      },
    );
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  return { appointments, loading };
}

export function useSaveAppointment(): { save: (appt: Appointment) => Promise<boolean> } {
  const save = async (appt: Appointment): Promise<boolean> => {
    try {
      await setDoc(doc(db, "appointments", appt.id), stripUndefined(appt), { merge: true });
      return true;
    } catch (e) {
      console.error("useSaveAppointment error:", e);
      return false;
    }
  };
  return { save };
}

export function useDeleteAppointment(): { remove: (id: string) => Promise<boolean> } {
  const remove = async (id: string): Promise<boolean> => {
    try {
      await deleteDoc(doc(db, "appointments", id));
      return true;
    } catch (e) {
      console.error("useDeleteAppointment error:", e);
      return false;
    }
  };
  return { remove };
}

// ── Lead Notes (subcollection: leads/{leadId}/notes) ──────────────────────────

/**
 * Real-time listener for a lead's note subcollection.
 * Returns notes sorted newest-first (orderBy createdAt desc).
 */
export function useLeadNotes(leadId: string): { notes: LeadNote[]; loading: boolean } {
  const [notes, setNotes] = useState<LeadNote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!leadId) {
      setLoading(false);
      return;
    }
    const q = query(collection(db, "leads", leadId, "notes"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setNotes(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as LeadNote));
        setLoading(false);
      },
      (err) => {
        console.error("useLeadNotes error:", err);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [leadId]);

  return { notes, loading };
}

/** Adds a new note document to leads/{leadId}/notes */
export function useAddLeadNote(): { add: (leadId: string, note: Omit<LeadNote, "id">) => Promise<boolean> } {
  const add = async (leadId: string, note: Omit<LeadNote, "id">): Promise<boolean> => {
    try {
      await addDoc(collection(db, "leads", leadId, "notes"), note);
      return true;
    } catch (e) {
      console.error("useAddLeadNote error:", e);
      return false;
    }
  };
  return { add };
}

/** Deletes a single note from leads/{leadId}/notes/{noteId} */
export function useDeleteLeadNote(): { remove: (leadId: string, noteId: string) => Promise<boolean> } {
  const remove = async (leadId: string, noteId: string): Promise<boolean> => {
    try {
      await deleteDoc(doc(db, "leads", leadId, "notes", noteId));
      return true;
    } catch (e) {
      console.error("useDeleteLeadNote error:", e);
      return false;
    }
  };
  return { remove };
}

// ── Lead-linked Appointments ──────────────────────────────────────────────────

/**
 * Real-time listener for all appointments linked to a specific lead.
 * Queries appointments where linkedLeadId === leadId.
 * Results are sorted client-side by date → startTime (ascending).
 */
export function useLeadAppointments(leadId: number | null): { appointments: Appointment[]; loading: boolean } {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!leadId) {
      setLoading(false);
      return;
    }
    const q = query(collection(db, "appointments"), where("linkedLeadId", "==", leadId));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const data = snap.docs.map((d) => ({ ...d.data(), id: d.id }) as Appointment);
        // Sort: soonest first
        data.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
        setAppointments(data);
        setLoading(false);
      },
      (err) => {
        console.error("useLeadAppointments error:", err);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [leadId]);

  return { appointments, loading };
}

// ── Training Sessions (AI Roleplay) ──────────────────────────────────────────

/**
 * useTrainingSessions — real-time listener for the `trainingSessions` Firestore collection.
 *
 * Pass `repId` to scope results to a single rep.
 * Pass `null` to get all sessions (admin view).
 * Sessions are returned newest-first (sorted by completedAt desc).
 */
export function useTrainingSessions(repId: number | null): {
  sessions: RoleplaySession[];
  loading: boolean;
} {
  const [sessions, setSessions] = useState<RoleplaySession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // repId filter — new sessions write numeric `repId`; legacy sessions wrote string `userId`.
    // We query by repId (numeric) here; the RoleplayDashboard falls back to userId matching client-side if needed.
    let q;
    if (repId !== null) {
      q = query(
        collection(db, "trainingSessions"),
        where("repId", "==", repId),
        orderBy("completedAt", "desc"),
        limit(200),
      );
    } else {
      q = query(collection(db, "trainingSessions"), orderBy("completedAt", "desc"), limit(500));
    }

    const unsub = onSnapshot(
      q,
      (snap) => {
        const data = snap.docs.map((d) => ({ ...d.data(), id: d.id }) as RoleplaySession);
        setSessions(data);
        setLoading(false);
      },
      (err) => {
        console.error("useTrainingSessions error:", err);
        setLoading(false);
      },
    );

    return () => unsub();
  }, [repId]);

  return { sessions, loading };
}

// ── Deals (read-only list, used by RepDashboard) ──────────────────────────────

export interface Deal {
  id: string;
  clientName: string;
  status: "lead" | "conditional" | "unconditional" | "settled" | "lost";
  dealValue: number;
  commissionTotal: number;
  commissionPaid: number;
  expectedSettlementDate: string;
  assignedTo: number; // rep id
  lastUpdate: number;
  createdAt: number;
  notes?: string[];
}

/**
 * useDeals — Real-time listener for the `deals` collection.
 *
 * Query strategy:
 *  1. Try scoped query: where("assignedTo", "==", repId) + orderBy
 *  2. If that fails (permissions/index): fallback to orderBy only
 *  3. If fallback also fails: show error
 *
 * Snapshot protection:
 *  - Never clear deals array on error (prevents flash)
 *  - Sets error state so UI can show it alongside existing data
 *  - Always sets loading = false
 *
 * Debug logs:
 *  - Query composition
 *  - Snapshot document count
 *  - Error source with full details
 */
export function useDeals(repId: number | null = null): {
  deals: Deal[];
  loading: boolean;
  error: string | null;
} {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // ── Validate inputs ─────────────────────────────────────────────────
    if (repId != null && (typeof repId !== "number" || isNaN(repId))) {
      console.error("[useDeals] Invalid repId:", repId, typeof repId);
      setError("Invalid user context — repId is not a valid number.");
      setLoading(false);
      return;
    }

    const filters = { assignedTo: repId ?? null };
    console.log("[useDeals] Query params:", { repId, filters });

    // ── Parse error for user display ────────────────────────────────────
    const parseError = (err: unknown): string => {
      const code = (err as { code?: string })?.code;
      const message = (err as { message?: string })?.message || "unknown error";
      console.error("[useDeals] Deals query failed:", err);
      console.error("[useDeals] Error code:", code);
      console.error("[useDeals] Error message:", message);

      if (code === "permission-denied") {
        return "You do not have permission to view deals.";
      }
      if (code === "failed-precondition") {
        return "A required Firestore index is missing. Check the console for details.";
      }
      if (code === "unavailable") {
        return "Firestore is currently unavailable. Check your connection.";
      }
      return message;
    };

    // ── Snapshot data handler ───────────────────────────────────────────
    const handleSnapshot = (snap: import("firebase/firestore").QuerySnapshot) => {
      console.log("[useDeals] Snapshot received — doc count:", snap.docs.length);
      const loaded: Deal[] = [];
      snap.forEach((d) => {
        const data = d.data();
        if (data && typeof data === "object" && "clientName" in data) {
          loaded.push({ id: d.id, ...(data as Omit<Deal, "id">) });
        } else {
          console.warn("[useDeals] Skipping invalid deal document:", d.id, data);
        }
      });
      setDeals(loaded);
      setError(null);
      setLoading(false);
    };

    // ── Try scoped query first, fallback to basic on permission error ───
    let unsub: (() => void) | null = null;
    let scopedFailed = false;

    const attachScopedQuery = () => {
      if (repId == null) {
        // No rep filter — use basic query directly
        attachBasicQuery();
        return;
      }

      try {
        const base = collection(db, "deals") as import("firebase/firestore").Query;
        console.log("[useDeals] Adding where filter: assignedTo ==", repId);
        const scopedQ = query(base, where("assignedTo", "==", repId), orderBy("createdAt", "desc"), limit(50));
        console.log("[useDeals] Attached scoped query (with where filter)");

        unsub = onSnapshot(scopedQ, handleSnapshot, (scopedErr) => {
          console.warn("[useDeals] Scoped query failed, falling back to basic query:", scopedErr);
          scopedFailed = true;

          // Retry with basic query (no where filter)
          attachBasicQuery(true);
        });
      } catch (buildErr) {
        console.error("[useDeals] Failed to build scoped query:", buildErr);
        attachBasicQuery(true);
      }
    };

    const attachBasicQuery = (isFallback = false) => {
      try {
        const base = collection(db, "deals") as import("firebase/firestore").Query;
        const basicQ = query(base, orderBy("createdAt", "desc"), limit(50));
        console.log("[useDeals] Attached basic query (no where filter)");

        unsub = onSnapshot(
          basicQ,
          (snap) => {
            handleSnapshot(snap);
            if (isFallback) {
              setError("Unable to apply rep filter — showing all deals.");
            }
          },
          (basicErr) => {
            const parsedMsg = parseError(basicErr);
            setError(parsedMsg);
            setLoading(false);
          },
        );
      } catch (buildErr) {
        console.error("[useDeals] Failed to build basic query:", buildErr);
        setError("Unable to load deals — query construction failed.");
        setLoading(false);
      }
    };

    attachScopedQuery();

    return () => {
      if (unsub) {
        unsub();
        console.log("[useDeals] onSnapshot listener cleaned up");
      }
    };
  }, [repId]);

  return { deals, loading, error };
}

// ── User Devices (FCM token store) ───────────────────────────────────────────

/**
 * useUserDevices — Real-time listener for a user's registered FCM devices.
 * Used by the notification system to display which devices are registered.
 */
export function useUserDevices(userId: number | null): {
  devices: UserDevice[];
  loading: boolean;
} {
  const [devices, setDevices] = useState<UserDevice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userId == null) {
      setDevices([]);
      setLoading(false);
      return;
    }
    const q = query(collection(db, "userDevices"), where("userId", "==", userId));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setDevices(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as UserDevice));
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, [userId]);

  return { devices, loading };
}

// ── Daily Stats ───────────────────────────────────────────────────────────────

/**
 * useDailyStatsFirebase — Real-time listener for the `dailyStats` collection.
 * Complements useDailyStats.ts (which has richer query options).
 * This lightweight version is used in DailyReportDashboard for a date-scoped view.
 */
export function useDailyStatsFirebase(date: string): {
  stats: DailyStats[];
  loading: boolean;
} {
  const [stats, setStats] = useState<DailyStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!date) {
      setStats([]);
      setLoading(false);
      return;
    }
    const q = query(collection(db, "dailyStats"), where("date", "==", date), orderBy("repName", "asc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setStats(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as DailyStats));
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, [date]);

  return { stats, loading };
}

// ── Deal Documents ────────────────────────────────────────────────────────────

/** Allowed file types for deal documents */
const ALLOWED_DOC_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

/** Max file size: 10 MB */
const MAX_DOC_SIZE = 10 * 1024 * 1024;

/** Validate a file before upload. Returns error message or null if valid. */
function validateDealFile(file: File): string | null {
  if (file.size > MAX_DOC_SIZE) {
    return "File too large. Maximum size is 10 MB.";
  }
  if (!ALLOWED_DOC_TYPES.includes(file.type)) {
    return "Invalid file type. Only PDF, PNG, JPG, DOC, and DOCX files are allowed.";
  }
  return null;
}

export type DealDocumentUploadResult = { success: true } | { success: false; error: string };

/**
 * useDealDocuments — Real-time listener for deal-scoped documents.
 * Returns documents list, loading state, upload and delete functions.
 * Documents are stored in Firestore collection `dealDocuments` and
 * files in Firebase Storage at `/deals/{dealId}/{fileName}`.
 */
export function useDealDocuments(dealId: string) {
  const [documents, setDocuments] = useState<DealDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { currentUser } = useAppStore();

  // Real-time listener
  useEffect(() => {
    if (!dealId) {
      setDocuments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(collection(db, "dealDocuments"), where("dealId", "==", dealId), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const loaded: DealDocument[] = [];
        snap.forEach((d) => {
          const data = d.data() as Omit<DealDocument, "id">;
          // Skip documents missing required fileUrl
          if (data && data.fileUrl) {
            loaded.push({ id: d.id, ...data });
          }
        });
        setDocuments(loaded);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, [dealId]);

  const uploadDocument = useCallback(
    async (file: File, docType: DealDocumentType, clientId?: string): Promise<DealDocumentUploadResult> => {
      if (!dealId || !currentUser) {
        return { success: false, error: "No deal or user context available." };
      }

      // Validate file before attempting upload
      const validationError = validateDealFile(file);
      if (validationError) {
        return { success: false, error: validationError };
      }

      setUploading(true);
      let uploadedStoragePath: string | null = null;

      try {
        // Sanitise filename
        const sanitised = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const storagePath = `deals/${dealId}/${Date.now()}_${sanitised}`;

        // Upload to Firebase Storage
        const downloadUrl = await uploadFile(storagePath, file);
        uploadedStoragePath = storagePath;

        // Save metadata to Firestore
        await addDoc(collection(db, "dealDocuments"), {
          dealId,
          clientId: clientId || "",
          name: file.name,
          type: docType,
          fileUrl: downloadUrl,
          storagePath,
          fileType: file.type || "application/octet-stream",
          fileSize: file.size,
          uploadedBy: currentUser.name || "Unknown",
          createdAt: Date.now(),
        });

        return { success: true };
      } catch (err) {
        console.error("[useDealDocuments] Upload failed:", err);

        // Rollback: if storage upload succeeded but firestore failed, delete the storage file
        if (uploadedStoragePath) {
          try {
            await deleteFile(uploadedStoragePath);
          } catch (rollbackErr) {
            console.error("[useDealDocuments] Rollback delete failed:", rollbackErr);
          }
        }

        const message = (err as Error)?.message || "Unknown error during upload.";
        return { success: false, error: message };
      } finally {
        setUploading(false);
      }
    },
    [dealId, currentUser],
  );

  const deleteDocument = useCallback(async (dealDoc: DealDocument): Promise<{ success: boolean; error?: string }> => {
    try {
      // Delete from Storage first
      if (dealDoc.storagePath) {
        try {
          await deleteFile(dealDoc.storagePath);
        } catch {
          // Storage file may already be deleted — continue to remove Firestore doc
        }
      }
      // Delete Firestore document
      await deleteDoc(doc(db, "dealDocuments", dealDoc.id));
      return { success: true };
    } catch (err) {
      console.error("[useDealDocuments] Delete failed:", err);
      return { success: false, error: (err as Error)?.message || "Failed to delete document." };
    }
  }, []);

  return { documents, loading, uploading, deletingId, uploadDocument, deleteDocument, setDeletingId };
}
