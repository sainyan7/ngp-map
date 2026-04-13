import { collection, onSnapshot, doc, updateDoc, addDoc, deleteDoc } from 'firebase/firestore';
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

/**
 * Add a new city document to Firestore.
 * @param {{ lat: number, lng: number, name: string, type: string }} data
 * @returns {Promise<string>} new document ID
 */
export async function addCity(data) {
  const ref = await addDoc(collection(db, 'cities'), data);
  return ref.id;
}

/**
 * Delete a city document from Firestore.
 * @param {string} id
 */
export async function deleteCity(id) {
  await deleteDoc(doc(db, 'cities', id));
}
