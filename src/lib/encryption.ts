// Encryption is handled server-side via Firebase Functions (AES-256-GCM).
// These stubs are kept to avoid breaking any remaining import sites during migration.

export function encrypt(_text: string): string {
  throw new Error("Client-side encryption removed — use saveSmsfFinancials cloud function");
}

export function decrypt(_cipher: string): string {
  throw new Error("Client-side decryption removed — use getSmsfFinancials cloud function");
}
