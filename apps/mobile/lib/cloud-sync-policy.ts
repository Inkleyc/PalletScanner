export type SyncBaseline = {
  userId: string;
  items: Record<string, string>;
  pallets: Record<string, string>;
};

export const changedSinceBaseline = <T>(
  records: T[],
  baseline: Map<string | number, string>,
  getId: (record: T) => string | number,
  serialize: (record: T) => string,
) => records.filter((record) => baseline.get(getId(record)) !== serialize(record));

export const deletedSinceBaseline = <T>(
  remoteRecords: T[],
  baseline: Map<string | number, string>,
  localIds: Set<string | number>,
  getRemoteId: (record: T) => string | number,
) => remoteRecords.filter((record) => {
  const id = getRemoteId(record);
  return baseline.has(id) && !localIds.has(id);
});

export const serializeBaseline = (
  userId: string,
  items: Map<number, string>,
  pallets: Map<string, string>,
): SyncBaseline => ({
  userId,
  items: Object.fromEntries([...items].map(([id, value]) => [String(id), value])),
  pallets: Object.fromEntries(pallets),
});

export const restoreBaseline = (value: SyncBaseline | null, userId: string) => {
  if (!value || value.userId !== userId) {
    return { items: new Map<number, string>(), pallets: new Map<string, string>(), matchesUser: false };
  }
  return {
    items: new Map(Object.entries(value.items).map(([id, fingerprint]) => [Number(id), fingerprint])),
    pallets: new Map(Object.entries(value.pallets)),
    matchesUser: true,
  };
};

export const planPhotoSync = (photos: string[]) => ({
  uploads: photos
    .map((uri, position) => ({ uri, position }))
    .filter(({ uri }) => !/^https?:\/\//i.test(uri)),
  removePositionsFrom: photos.length,
});
