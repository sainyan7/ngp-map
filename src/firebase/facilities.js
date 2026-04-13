import { collection, onSnapshot, doc, updateDoc, addDoc, deleteDoc } from 'firebase/firestore';
import { db } from './config';

/**
 * Subscribe to all facilities with real-time updates.
 * Each doc: { name, type: 'airport'|'port'|'military'|'other', subtype, lat, lng, ruby? }
 */
export function subscribeFacilities(callback) {
  return onSnapshot(collection(db, 'facilities'), (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function updateFacility(id, data) {
  await updateDoc(doc(db, 'facilities', id), data);
}

/**
 * Add a new facility document to Firestore.
 * @param {{ lat: number, lng: number, name: string, type: string, subtype: string|null }} data
 * @returns {Promise<string>} new document ID
 */
export async function addFacility(data) {
  const ref = await addDoc(collection(db, 'facilities'), data);
  return ref.id;
}

/**
 * Delete a facility document from Firestore.
 * @param {string} id
 */
export async function deleteFacility(id) {
  await deleteDoc(doc(db, 'facilities', id));
}
