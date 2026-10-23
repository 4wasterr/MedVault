const timestamp = value => {
  const result = value ? Date.parse(value) : NaN;
  return Number.isFinite(result) ? result : 0;
};

export const recordRecency = record => Math.max(...[
  'lastUpdatedAt', 'updatedAt', 'updated_at', 'createdAt', 'created_at', 'savedAt', 'recordedAt',
].map(field => timestamp(record?.[field])));

export const compareRecordsNewestFirst = (a, b) => recordRecency(b) - recordRecency(a) ||
  timestamp(b.createdAt || b.created_at) - timestamp(a.createdAt || a.created_at);

// Stable sorting preserves the server's newest-inserted order for legacy rows
// without timestamps, and never mutates a shared snapshot or a form draft.
export const newestRecordsFirst = records => [...records].sort(compareRecordsNewestFirst);

export function stampChangedRecords(previous, records, now = new Date().toISOString()) {
  const byId = new Map(previous.map(record => [record.id, record]));
  return newestRecordsFirst(records.map(record => {
    const before = byId.get(record.id);
    if (JSON.stringify(record) === JSON.stringify(before)) return record;
    return { ...record, createdAt: before?.createdAt || record.createdAt || now, lastUpdatedAt: now };
  }));
}
