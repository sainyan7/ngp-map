import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from './config';

/**
 * Subscribe to all cities with real-time updates.
 * Each doc: { name, type: 'capital'|'major_city'|'state_capital'|'city', lat, lng }
 */
export function subscribeCities(callback) {
  return onSnapshot(collection(db, 'cities'), (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function updateCity(id, data) {
  await updateDoc(doc(db, 'cities', id), data);
}
