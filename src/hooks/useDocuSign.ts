/**
 * useDocuSign.ts — Frontend hook for DocuSign envelope operations.
 *
 * Calls Firebase Functions — never talks to DocuSign API directly.
 */

import { useCallback, useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getApps } from "firebase/app";

interface DocuSignEnvelopeResult {
  success: boolean;
  envelopeId: string;
  status: string;
  envelopeDocId?: string;
}

interface UseDocuSignReturn {
  sendForSigning: (params: {
    documentUrl: string;
    clientName: string;
    clientEmail: string;
    dealId: string;
    clientId: string;
    documentName?: string;
    oaDocumentInstanceId?: string;
    signers?: { email: string; name: string; routingOrder?: string }[];
  }) => Promise<DocuSignEnvelopeResult>;
  resendEnvelope: (envelopeId: string) => Promise<{ success: boolean; status: string }>;
  voidEnvelope: (envelopeId: string, reason?: string) => Promise<{ success: boolean; status: string }>;
  syncStatus: (envelopeId: string) => Promise<{
    success: boolean;
    actualStatus: string;
    previousStatus: string;
    statusMismatch: boolean;
  }>;
  sending: boolean;
  error: string | null;
}

function getFunctionsInstance() {
  const apps = getApps();
  return getFunctions(apps.length > 0 ? apps[0] : undefined);
}

export function useDocuSign(): UseDocuSignReturn {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendForSigning = useCallback(
    async (params: {
      documentUrl: string;
      clientName: string;
      clientEmail: string;
      dealId: string;
      clientId: string;
      documentName?: string;
      oaDocumentInstanceId?: string;
      signers?: { email: string; name: string; routingOrder?: string }[];
    }): Promise<DocuSignEnvelopeResult> => {
      setSending(true);
      setError(null);

      try {
        const functions = getFunctionsInstance();
        const createEnvelope = httpsCallable<typeof params, DocuSignEnvelopeResult>(
          functions,
          "createDocuSignEnvelope",
        );
        const result = await createEnvelope(params);
        return result.data;
      } catch (err) {
        const message = (err as { message?: string })?.message || "Failed to send document for signing.";
        setError(message);
        console.error("[useDocuSign] Failed to create DocuSign envelope:", err);
        throw err;
      } finally {
        setSending(false);
      }
    },
    [],
  );

  const resendEnvelope = useCallback(async (envelopeId: string): Promise<{ success: boolean; status: string }> => {
    setError(null);
    try {
      const functions = getFunctionsInstance();
      const resend = httpsCallable<{ envelopeId: string }, { success: boolean; status: string }>(
        functions,
        "resendDocuSignEnvelope",
      );
      const result = await resend({ envelopeId });
      return result.data;
    } catch (err) {
      const message = (err as { message?: string })?.message || "Failed to resend envelope.";
      setError(message);
      throw err;
    }
  }, []);

  const voidEnvelope = useCallback(
    async (envelopeId: string, reason?: string): Promise<{ success: boolean; status: string }> => {
      setError(null);
      try {
        const functions = getFunctionsInstance();
        const voidFn = httpsCallable<{ envelopeId: string; reason?: string }, { success: boolean; status: string }>(
          functions,
          "voidDocuSignEnvelope",
        );
        const result = await voidFn({ envelopeId, reason });
        return result.data;
      } catch (err) {
        const message = (err as { message?: string })?.message || "Failed to void envelope.";
        setError(message);
        throw err;
      }
    },
    [],
  );

  /**
   * Syncs the envelope status with DocuSign API.
   * Use on-demand when loading a deal/document to check for mismatches.
   */
  const syncStatus = useCallback(
    async (
      envelopeId: string,
    ): Promise<{
      success: boolean;
      actualStatus: string;
      previousStatus: string;
      statusMismatch: boolean;
    }> => {
      setError(null);
      try {
        const functions = getFunctionsInstance();
        const syncFn = httpsCallable<
          { envelopeId: string },
          { success: boolean; actualStatus: string; previousStatus: string; statusMismatch: boolean }
        >(functions, "syncEnvelopeStatus");
        const result = await syncFn({ envelopeId });
        return result.data;
      } catch (err) {
        const message = (err as { message?: string })?.message || "Failed to sync envelope status.";
        setError(message);
        throw err;
      }
    },
    [],
  );

  return { sendForSigning, resendEnvelope, voidEnvelope, syncStatus, sending, error };
}

export default useDocuSign;
