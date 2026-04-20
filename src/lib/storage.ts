/**
 * Firebase Storage utilities
 * Used by Document Centre and Lead File Attachments
 */

import { ref, uploadBytes, getDownloadURL, deleteObject, getBlob } from "firebase/storage";
import { FirebaseError } from "firebase/app";
import { storage } from "./firebase";

/** Upload a File to Firebase Storage and return the public download URL */
export async function uploadFile(path: string, file: File | Blob): Promise<string> {
  try {
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file);
    return getDownloadURL(storageRef);
  } catch (error) {
    const firebaseError = error as FirebaseError;
    console.error(`Storage upload failed for path "${path}":`, firebaseError.message);
    throw new Error(`Failed to upload file: ${firebaseError.message}`);
  }
}

/** Download a file from Firebase Storage by its storage path and return ArrayBuffer */
export async function downloadFileAsArrayBuffer(path: string): Promise<ArrayBuffer> {
  try {
    const blob = await getBlob(ref(storage, path));
    return blob.arrayBuffer();
  } catch (error) {
    const firebaseError = error as FirebaseError;
    console.error(`Storage download failed for path "${path}":`, firebaseError.message);
    throw new Error(`Failed to download file: ${firebaseError.message}`);
  }
}

/** Delete a file from Firebase Storage by its path */
export async function deleteFile(path: string): Promise<void> {
  try {
    await deleteObject(ref(storage, path));
  } catch (error) {
    const firebaseError = error as FirebaseError;
    // Ignore "object not found" errors — file may have been deleted already
    if (firebaseError.code !== "storage/object-not-found") {
      console.error(`Storage delete failed for path "${path}":`, firebaseError.message);
      throw new Error(`Failed to delete file: ${firebaseError.message}`);
    }
  }
}

/** Format bytes to human-readable size string */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Return an emoji icon for a given MIME type */
export function fileTypeIcon(fileType: string): string {
  if (!fileType) return "📎";
  if (fileType.includes("pdf")) return "📄";
  if (fileType.startsWith("image/")) return "🖼️";
  if (
    fileType.includes("spreadsheet") ||
    fileType.includes("xlsx") ||
    fileType.includes("csv") ||
    fileType.includes("excel")
  )
    return "📊";
  if (fileType.includes("word") || fileType.includes("docx") || fileType.includes("document")) return "📝";
  if (fileType.includes("presentation") || fileType.includes("powerpoint") || fileType.includes("pptx")) return "📊";
  if (fileType.includes("text")) return "📃";
  if (fileType.includes("zip") || fileType.includes("archive")) return "🗜️";
  return "📎";
}

/** Return the file extension from a filename */
export function fileExtension(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}
