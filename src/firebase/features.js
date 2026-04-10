import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './config';

const COLLECTION = 'features';

/**
 * Add a new feature to Firestore.
 * @param {object} featureData - { layerType, type, geometry, properties, updatedBy }
 */
export async function addFeature(featureData) {
  return addDoc(collection(db, COLLECTION), {
    ...featureData,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Update an existing feature.
 * @param {string} id - Firestore document ID
 * @param {object} data - fields to update
 */
export async function updateFeature(id, data) {
  return updateDoc(doc(db, COLLECTION, id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Delete a feature by ID.
 * @param {string} id - Firestore document ID
 */
export async function deleteFeature(id) {
  return deleteDoc(doc(db, COLLECTION, id));
}

/**
 * Subscribe to all features with real-time updates.
 * @param {function} callback - called with array of { id, ...data }
 * @returns {function} unsubscribe function
 */
export function subscribeFeatures(callback) {
  return onSnapshot(collection(db, COLLECTION), (snapshot) => {
    const features = snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      // Convert Firestore Timestamps to ISO strings for easy handling
      createdAt: d.data().createdAt?.toDate?.()?.toISOString() ?? null,
      updatedAt: d.data().updatedAt?.toDate?.()?.toISOString() ?? null,
    }));
    callback(features);
  });
}
