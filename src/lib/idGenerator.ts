/**
 * ID Generation Utilities
 * 
 * Provides cryptographically-random ID generation for leads and other entities.
 * Uses crypto.getRandomValues() when available, falls back to Math.random() only if necessary.
 */

/**
 * Generate a unique integer ID for leads (safe up to ~9 quadrillion)
 * Uses Date.now() * 1000 + random 0-999 to avoid float precision issues
 */
export function generateLeadId(): number {
  const base = Date.now();
  // Use crypto.getRandomValues for better randomness
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    return base * 1000 + (array[0] % 1000);
  }
  // Fallback (shouldn't be needed in modern browsers)
  return base * 1000 + Math.floor(Math.random() * 1000);
}

/**
 * Generate a unique string ID (format: prefix_timestamp_random)
 * Useful for appointments, notes, and other entities
 */
export function generateId(prefix?: string): string {
  const timestamp = Date.now().toString(36);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const array = new Uint32Array(2);
    crypto.getRandomValues(array);
    const random = (array[0].toString(36) + array[1].toString(36)).slice(0, 8);
    return prefix ? `${prefix}_${timestamp}_${random}` : `${timestamp}_${random}`;
  }
  const random = Math.random().toString(36).slice(2, 10);
  return prefix ? `${prefix}_${timestamp}_${random}` : `${timestamp}_${random}`;
}
