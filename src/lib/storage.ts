/**
 * Firebase Storage utilities
 * Used by Document Centre and Lead File Attachments
 */

import { ref, uploadBytes, getDownloadURL, deleteObject, uploadBytesResumable, getBlob } from 'firebase/storage';
import { storage } from './firebase';

/** Upload a File to Firebase Storage and return the public download URL */
export async function uploadFile(path: string, file: File | Blob): Promise<string> {
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

/** Download a file from Firebase Storage by its storage path and return ArrayBuffer */
export async function downloadFileAsArrayBuffer(path: string): Promise<ArrayBuffer> {
  const blob = await getBlob(ref(storage, path));
  return blob.arrayBuffer();
}

/** Delete a file from Firebase Storage by its path */
export async function deleteFile(path: string): Promise<void> {
  try {
    await deleteObject(ref(storage, path));
  } catch {
    // Ignore "object not found" errors — file may have been deleted already
  }
}

/** Format bytes to human-readable size string */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Return an emoji icon for a given MIME type */
export function fileTypeIcon(fileType: string): string {
  if (!fileType) return '📎';
  if (fileType.includes('pdf')) return '📄';
  if (fileType.startsWith('image/')) return '🖼️';
  if (fileType.includes('spreadsheet') || fileType.includes('xlsx') || fileType.includes('csv') || fileType.includes('excel')) return '📊';
  if (fileType.includes('word') || fileType.includes('docx') || fileType.includes('document')) return '📝';
  if (fileType.includes('presentation') || fileType.includes('powerpoint') || fileType.includes('pptx')) return '📊';
  if (fileType.includes('text')) return '📃';
  if (fileType.includes('zip') || fileType.includes('archive')) return '🗜️';
  return '📎';
}

/** Return the file extension from a filename */
export function fileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? '';
}
