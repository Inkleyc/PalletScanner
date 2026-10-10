import { repository as localRepository } from "./inventory-repository.js";
import { createSupabaseInventoryRepository } from "./supabase-inventory-repository.js";
import { supabase } from "./supabase.js";

let activeRepository = localRepository;
let mode = "local";
let activeUnsubscribe = null;
const listeners = new Set();

const notify = (snapshot = activeRepository.getSnapshot()) => {
  listeners.forEach((listener) => listener(snapshot));
};

const attach = () => {
  activeUnsubscribe?.();
  activeUnsubscribe = activeRepository.subscribe(notify);
};
attach();

export const getRepositoryMode = () => mode;

export const useCloudRepository = async () => {
  if (!supabase) throw new Error("Supabase is not configured.");
  const cloudRepository = createSupabaseInventoryRepository(supabase);
  const snapshot = await cloudRepository.hydrate();
  activeRepository = cloudRepository;
  mode = "cloud";
  attach();
  notify(snapshot);
  return snapshot;
};

export const useLocalRepository = async () => {
  activeRepository = localRepository;
  mode = "local";
  attach();
  const snapshot = await localRepository.hydrate();
  notify(snapshot);
  return snapshot;
};

export const repository = {
  getSnapshot: () => activeRepository.getSnapshot(),
  hydrate: () => activeRepository.hydrate(),
  subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  saveItem: (...args) => activeRepository.saveItem(...args),
  removeItem: (...args) => activeRepository.removeItem(...args),
  createPallet: (...args) => activeRepository.createPallet(...args),
  updatePallet: (...args) => activeRepository.updatePallet(...args),
  removePallet: (...args) => activeRepository.removePallet(...args),
  setActivePallet: (...args) => activeRepository.setActivePallet(...args),
  listPhotos: (...args) => activeRepository.listPhotos(...args),
  listSales: (...args) => activeRepository.listSales(...args),
  recordSale: (...args) => activeRepository.recordSale(...args),
  listActivity: (...args) => activeRepository.listActivity(...args),
  listMovements: (...args) => activeRepository.listMovements(...args),
  listReservations: (...args) => activeRepository.listReservations(...args),
  reserveItem: (...args) => activeRepository.reserveItem(...args),
  releaseReservation: (...args) => activeRepository.releaseReservation(...args),
  verifyImportedItem: (...args) => {
    if (typeof activeRepository.verifyImportedItem !== "function") throw new Error("Imported inventory verification requires cloud inventory.");
    return activeRepository.verifyImportedItem(...args);
  },
  replaceSnapshot: (...args) => {
    if (typeof activeRepository.replaceSnapshot !== "function") {
      throw new Error("Backup restore is only available for local preview data.");
    }
    return activeRepository.replaceSnapshot(...args);
  },
};
