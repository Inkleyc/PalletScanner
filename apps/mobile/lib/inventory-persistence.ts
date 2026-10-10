import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

import { readWebStorage, writeWebStorage } from "@/lib/web-storage";

const inventoryFile = `${FileSystem.documentDirectory}inventory.json`;
const activePalletFile = `${FileSystem.documentDirectory}active-pallet.txt`;
const inventoryWebKey = "inventory";
const activePalletWebKey = "active-pallet-id";

export const writeInventoryStorage = async (value: string) => {
  if (Platform.OS === "web") {
    await writeWebStorage(inventoryWebKey, value);
    return;
  }
  await FileSystem.writeAsStringAsync(inventoryFile, value, { encoding: "utf8" });
};

export const readInventoryStorage = async () => {
  if (Platform.OS === "web") return readWebStorage(inventoryWebKey);
  const info = await FileSystem.getInfoAsync(inventoryFile);
  if (!info.exists) return null;
  return FileSystem.readAsStringAsync(inventoryFile, { encoding: "utf8" });
};

export const writeActivePalletStorage = async (value: string) => {
  if (Platform.OS === "web") {
    await writeWebStorage(activePalletWebKey, value);
    return;
  }
  await FileSystem.writeAsStringAsync(activePalletFile, value, { encoding: "utf8" });
};

export const readActivePalletStorage = async () => {
  if (Platform.OS === "web") return readWebStorage(activePalletWebKey);
  const info = await FileSystem.getInfoAsync(activePalletFile);
  if (!info.exists) return null;
  return FileSystem.readAsStringAsync(activePalletFile, { encoding: "utf8" });
};
