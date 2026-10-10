import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

import { browserUriToDataUri } from "@/lib/web-storage";

const photosDirectory = `${FileSystem.documentDirectory}photos/`;
let ensurePhotosDirectoryPromise: Promise<void> | null = null;

const ensurePhotosDirectory = async () => {
  if (Platform.OS === "web") return;
  if (!ensurePhotosDirectoryPromise) {
    ensurePhotosDirectoryPromise = FileSystem.makeDirectoryAsync(photosDirectory, {
      intermediates: true,
    }).catch(() => {
      ensurePhotosDirectoryPromise = null;
    }) as Promise<void>;
  }
  await ensurePhotosDirectoryPromise;
};

const isManagedPhotoPath = (uri: string | null | undefined) =>
  Boolean(uri && uri.startsWith(photosDirectory));

export const deleteStoredInventoryPhoto = async (
  uri: string | null | undefined,
) => {
  if (Platform.OS === "web" || !isManagedPhotoPath(uri)) return;
  try {
    const info = await FileSystem.getInfoAsync(uri as string);
    if (info.exists) {
      await FileSystem.deleteAsync(uri as string, { idempotent: true });
    }
  } catch {
    // Photo cleanup is best effort and must not block inventory changes.
  }
};

const getPhotoExtension = (uri: string) => {
  const sanitizedUri = uri.split("?")[0] ?? uri;
  const filename = sanitizedUri.split("/").pop() ?? "";
  const extension = filename.includes(".") ? filename.split(".").pop() : "";
  return !extension || extension.length > 5 ? "jpg" : extension.toLowerCase();
};

export const storeInventoryPhoto = async (
  uri: string,
  itemId: number,
  index = 0,
) => {
  if (Platform.OS === "web") {
    try {
      return await browserUriToDataUri(uri);
    } catch {
      return uri;
    }
  }
  if (isManagedPhotoPath(uri)) return uri;

  await ensurePhotosDirectory();
  const extension = getPhotoExtension(uri);
  const destination = `${photosDirectory}item-${itemId}-${index}-${Date.now()}.${extension}`;
  try {
    await FileSystem.copyAsync({ from: uri, to: destination });
    return destination;
  } catch {
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      await FileSystem.writeAsStringAsync(destination, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return destination;
    } catch {
      return uri;
    }
  }
};
