import { collection, onSnapshot, doc, updateDoc, addDoc, deleteDoc } from 'firebase/firestore';
import { db } from './config';

/**
 * Subscribe to all place name labels with real-time updates.
 * Each doc: { name, category, lat, lng }
 */
export function subscribePlaceNames(callback) {
  return onSnapshot(collection(db, 'placeNames'), (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function updatePlaceName(id, data) {
  await updateDoc(doc(db, 'placeNames', id), data);
}

export async function addPlaceName(data) {
  const ref = await addDoc(collection(db, 'placeNames'), data);
  return ref.id;
}

export async function deletePlaceName(id) {
  await deleteDoc(doc(db, 'placeNames', id));
}
