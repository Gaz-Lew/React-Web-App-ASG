import CryptoJS from "crypto-js";

const SECRET = "REPLACE_WITH_ENV_SECRET";

export function encrypt(text: string) {
  return CryptoJS.AES.encrypt(text, SECRET).toString();
}

export function decrypt(cipher: string) {
  try {
    const bytes = CryptoJS.AES.decrypt(cipher, SECRET);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch {
    return "";
  }
}
