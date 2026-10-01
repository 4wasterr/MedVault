export const emptyState = () => ({ patients: [], appointments: [], schedules: {}, doctors: [] });

export async function api(path, options = {}) {
  const response = await fetch(`/api/${path}`, {
    credentials: 'same-origin',
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || 'The server could not complete the request.');
    error.status = response.status;
    error.state = body.state;
    throw error;
  }
  return body;
}

function asMap(collection, value) {
  return collection === 'schedules' ? new Map(Object.entries(value || {}))
    : new Map((value || []).map((record) => [record.id, record]));
}

export function changesBetween(before, after) {
  const changes = [];
  for (const collection of ['patients', 'appointments', 'schedules']) {
    const oldRecords = asMap(collection, before[collection]);
    const newRecords = asMap(collection, after[collection]);
    for (const id of new Set([...oldRecords.keys(), ...newRecords.keys()])) {
      const previous = oldRecords.get(id) || null;
      const current = newRecords.get(id) || null;
      if (JSON.stringify(previous) !== JSON.stringify(current)) {
        changes.push({ collection, id, before: previous, after: current });
      }
    }
  }
  return changes;
}

export function applyChanges(state, changes) {
  const next = { patients: [...state.patients], appointments: [...state.appointments], schedules: { ...state.schedules }, doctors: [...(state.doctors || [])] };
  for (const { collection, id, after } of changes) {
    if (collection === 'schedules') {
      if (after === null) delete next.schedules[id];
      else next.schedules[id] = after;
      continue;
    }
    const index = next[collection].findIndex((record) => record.id === id);
    if (after === null && index >= 0) next[collection].splice(index, 1);
    else if (index >= 0) next[collection][index] = after;
    else if (after !== null) next[collection].unshift(after);
  }
  return next;
}
