/**
 * useDocumentInstances.ts — Firestore hooks for document instances.
 *
 * Provides:
 *  - useDocumentInstances(dealId) — real-time listener for a deal's document instances
 *  - useSaveDocumentInstance() — create/update a document instance
 *  - useDeleteDocumentInstance() — delete a document instance
 */

import { useState, useEffect, useCallback } from "react";
import { collection, onSnapshot, query, where, orderBy, addDoc, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { uploadFile, deleteFile } from "../../lib/storage";
import type { DocumentInstance, OADocumentData } from "../../types";

export function useDocumentInstances(dealId: string) {
  const [instances, setInstances] = useState<DocumentInstance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!dealId) {
      setInstances([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(collection(db, "documentInstances"), where("dealId", "==", dealId), orderBy("createdAt", "desc"));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const loaded: DocumentInstance[] = [];
        snap.forEach((d) => {
          const data = d.data();
          loaded.push({ id: d.id, ...data } as DocumentInstance);
        });
        setInstances(loaded);
        setLoading(false);
      },
      () => setLoading(false),
    );

    return () => unsub();
  }, [dealId]);

  return { instances, loading };
}

export function useSaveDocumentInstance() {
  const [saving, setSaving] = useState(false);

  const save = useCallback(
    async (
      dealId: string,
      clientId: string,
      clientName: string,
      data: OADocumentData,
      instanceId?: string,
    ): Promise<string> => {
      setSaving(true);
      try {
        const now = Date.now();
        const docData = {
          type: "offer-and-acceptance" as const,
          clientId,
          clientName,
          dealId,
          data,
          status: "draft" as const,
          updatedAt: now,
        };

        if (instanceId) {
          // Update existing
          await updateDoc(doc(db, "documentInstances", instanceId), docData);
          return instanceId;
        }

        // Create new
        const ref = await addDoc(collection(db, "documentInstances"), {
          ...docData,
          createdAt: now,
        });
        return ref.id;
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  return { save, saving };
}

export function useCompleteDocumentInstance() {
  const [saving, setSaving] = useState(false);

  const complete = useCallback(async (instanceId: string): Promise<void> => {
    setSaving(true);
    try {
      await updateDoc(doc(db, "documentInstances", instanceId), {
        status: "completed",
        updatedAt: Date.now(),
      });
    } finally {
      setSaving(false);
    }
  }, []);

  return { complete, saving };
}

/**
 * Upload a generated PDF to Firebase Storage and link it to a document instance.
 */
export function useUploadInstancePdf() {
  const [uploading, setUploading] = useState(false);

  const upload = useCallback(
    async (
      instanceId: string,
      dealId: string,
      pdfBytes: Uint8Array,
      filename: string,
    ): Promise<{ pdfUrl: string; pdfStoragePath: string }> => {
      setUploading(true);
      try {
        const sanitised = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
        const storagePath = `deals/${dealId}/documents/${Date.now()}_${sanitised}`;
        const pdfBlob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
        const downloadUrl = await uploadFile(storagePath, pdfBlob);

        await updateDoc(doc(db, "documentInstances", instanceId), {
          pdfUrl: downloadUrl,
          pdfStoragePath: storagePath,
          updatedAt: Date.now(),
        });

        return { pdfUrl: downloadUrl, pdfStoragePath: storagePath };
      } finally {
        setUploading(false);
      }
    },
    [],
  );

  return { upload, uploading };
}

export function useDeleteDocumentInstance() {
  const [deleting, setDeleting] = useState(false);

  const remove = useCallback(async (instance: DocumentInstance): Promise<void> => {
    setDeleting(true);
    try {
      // Delete PDF from storage if it exists
      if (instance.pdfStoragePath) {
        try {
          await deleteFile(instance.pdfStoragePath);
        } catch {
          /* may already be deleted */
        }
      }
      await deleteDoc(doc(db, "documentInstances", instance.id));
    } finally {
      setDeleting(false);
    }
  }, []);

  return { remove, deleting };
}
