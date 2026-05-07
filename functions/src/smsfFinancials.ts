import * as crypto from "crypto";
import { onCall } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";

const SMSF_SECRET = defineSecret("SMSF_SECRET");

export const saveSmsfFinancials = onCall(
  { secrets: [SMSF_SECRET] },
  async (req) => {
    const key = SMSF_SECRET.value();

    const iv = crypto.randomBytes(12);

    const cipher = crypto.createCipheriv(
      "aes-256-gcm",
      Buffer.from(key, "base64"),
      iv
    );

    let encrypted = cipher.update(JSON.stringify(req.data), "utf8");
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    const tag = cipher.getAuthTag();

    return {
      iv: iv.toString("base64"),
      data: encrypted.toString("base64"),
      tag: tag.toString("base64"),
    };
  }
);

export const getSmsfFinancials = onCall(
  { secrets: [SMSF_SECRET] },
  async (req) => {
    const key = SMSF_SECRET.value();

    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      Buffer.from(key, "base64"),
      Buffer.from(req.data.iv, "base64")
    );

    decipher.setAuthTag(Buffer.from(req.data.tag, "base64"));

    let decrypted = decipher.update(Buffer.from(req.data.data, "base64"));
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return JSON.parse(decrypted.toString("utf8"));
  }
);
