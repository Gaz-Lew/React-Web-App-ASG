/**
 * logger.ts — Production-safe logging utility
 *
 * Usage:
 *   import { logger } from '../lib/logger';
 *   logger.debug('Fetching leads...');
 *   logger.info('Lead saved', { id: 123 });
 *   logger.warn('Deprecated field used');
 *   logger.error('Firestore write failed', err);
 *
 * Behaviour:
 *   - In development (VITE_DEV or localhost):  all levels print to console
 *   - In production:  only warn + error are printed (debug + info are silenced)
 *   - Error level also attempts to log to Firestore `errors` collection (best-effort)
 */

import { db } from './firebase';
import { collection, addDoc } from 'firebase/firestore';

const IS_DEV =
  import.meta.env.DEV === true ||
  (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'));

function getUserId(): string {
  try {
    return localStorage.getItem('asg-crm:userId') ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

async function persistError(message: string, extra?: unknown): Promise<void> {
  try {
    const stack = extra instanceof Error ? (extra.stack ?? '') : '';
    const detail = extra && !(extra instanceof Error) ? JSON.stringify(extra).slice(0, 500) : '';
    await addDoc(collection(db, 'errors'), {
      timestamp: Date.now(),
      date: new Date().toISOString().split('T')[0],
      user: getUserId(),
      message,
      stack,
      detail,
      source: 'logger',
    });
  } catch {
    // Never let error logging throw
  }
}

export const logger = {
  debug(message: string, ...args: unknown[]): void {
    if (IS_DEV) console.debug(`[ASG] ${message}`, ...args);
  },

  info(message: string, ...args: unknown[]): void {
    if (IS_DEV) console.info(`[ASG] ${message}`, ...args);
  },

  warn(message: string, ...args: unknown[]): void {
    console.warn(`[ASG] ${message}`, ...args);
  },

  error(message: string, err?: unknown): void {
    console.error(`[ASG] ${message}`, err ?? '');
    // Fire-and-forget persistence to Firestore
    persistError(message, err).catch(() => {/* already handled inside persistError */});
  },
};

export default logger;
