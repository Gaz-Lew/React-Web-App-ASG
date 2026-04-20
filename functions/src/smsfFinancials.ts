import * as admin from "firebase-admin";
import * as crypto from "crypto";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";

admin.initializeApp();

const smsfSecret = defineSecret("SMSF_SECRET");

function encrypt(text: string, secret: string) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(
    "aes-256-cbc",
    Buffer.from(secret.padEnd(32)),
    iv
  );
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

export const saveSmsfFinancials = onCall(
  { secrets: [smsfSecret] },
  async (request) => {
    const SECRET = smsfSecret.value();
    const data = request.data;
    const context = request.auth;

    if (!context) {
      throw new HttpsError("unauthenticated", "Not authorised");
    }

    const { clientId, accountName, bsb, accountNumber } = data;

    if (!clientId) {
      throw new HttpsError("invalid-argument", "Missing clientId");
    }

    const db = admin.firestore();

    await db.collection("smsfFinancials").doc(String(clientId)).set({
      accountName: encrypt(accountName, SECRET),
      bsb: encrypt(bsb, SECRET),
      accountNumber: encrypt(accountNumber, SECRET),
      createdAt: Date.now(),
    });

    await db.collection("auditLogs").add({
      type: "smsf_write",
      clientId: String(clientId),
      userId: context.uid,
      timestamp: Date.now(),
    });

    return { success: true };
  }
);

function decrypt(data: string, secret: string) {
  const [ivHex, encryptedHex] = data.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const encryptedText = Buffer.from(encryptedHex, "hex");

  const decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    Buffer.from(secret.padEnd(32)),
    iv
  );

  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

export const getSmsfFinancials = onCall(
  { secrets: [smsfSecret] },
  async (request) => {
    const SECRET = smsfSecret.value();
    const data = request.data;
    const context = request.auth;

    if (!context) {
      throw new HttpsError("unauthenticated", "Not authorised");
    }

    const { clientId } = data;

    const db = admin.firestore();
    const doc = await db.collection("smsfFinancials").doc(String(clientId)).get();

    if (!doc.exists) return null;

    const d = doc.data()!;

    await db.collection("auditLogs").add({
      type: "smsf_read",
      clientId: String(clientId),
      userId: context.uid,
      timestamp: Date.now(),
    });

    return {
      accountName: decrypt(d.accountName, SECRET),
      bsb: decrypt(d.bsb, SECRET),
      accountNumber: decrypt(d.accountNumber, SECRET),
    };
  }
);
