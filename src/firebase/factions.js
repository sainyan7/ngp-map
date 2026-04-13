import {
  collection,
  collectionGroup,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  getDocs,
  onSnapshot,
} from 'firebase/firestore';
import { db } from './config';

/**
 * Subscribe to all factions with real-time updates.
 * @param {function} callback - called with array of { id, ...data }
 * @returns {function} unsubscribe function
 */
export function subscribeFactions(callback) {
  return onSnapshot(collection(db, 'factions'), (snapshot) => {
    const factions = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(factions);
  });
}

/**
 * Subscribe to diplomatic relations for a specific faction.
 * @param {string} factionId
 * @param {function} callback - called with array of { id (targetFactionId), relationType, ... }
 * @returns {function} unsubscribe function
 */
export function subscribeDiplomaticRelations(factionId, callback) {
  return onSnapshot(
    collection(db, 'factions', factionId, 'diplomatic'),
    (snapshot) => {
      const relations = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      callback(relations);
    }
  );
}

/**
 * Subscribe to ALL diplomatic relations across all factions using a collectionGroup query.
 * @param {function} callback - called with array of { factionId, targetFactionId, relationType, ... }
 * @returns {function} unsubscribe function
 */
export function subscribeAllDiplomaticRelations(callback) {
  return onSnapshot(collectionGroup(db, 'diplomatic'), (snapshot) => {
    const relations = snapshot.docs.map((d) => {
      const factionId = d.ref.parent.parent.id;
      return { factionId, targetFactionId: d.id, ...d.data() };
    });
    callback(relations);
  });
}

// ── CRUD ────────────────────────────────────────────────────────────────────

/**
 * Add a new faction.
 * @param {{ name, color, capital, description }} data
 * @returns {Promise<string>} new faction id
 */
export async function addFaction(data) {
  const ref = await addDoc(collection(db, 'factions'), {
    name: data.name ?? '',
    color: data.color ?? '#ef4444',
    capital: data.capital ?? '',
    description: data.description ?? '',
  });
  return ref.id;
}

/**
 * Update an existing faction.
 * @param {string} id
 * @param {Partial<{ name, color, capital, description }>} data
 */
export async function updateFaction(id, data) {
  await updateDoc(doc(db, 'factions', id), data);
}

/**
 * Delete a faction and all its diplomatic relations.
 * @param {string} id
 */
export async function deleteFaction(id) {
  // Delete diplomatic subcollection documents first
  const dipSnap = await getDocs(collection(db, 'factions', id, 'diplomatic'));
  await Promise.all(dipSnap.docs.map((d) => deleteDoc(d.ref)));
  await deleteDoc(doc(db, 'factions', id));
}

/**
 * Set (or update) diplomatic relation between two factions — both directions.
 * @param {string} factionIdA
 * @param {string} factionIdB
 * @param {string} relationType  one of: ally|friendly|neutral|tense|hostile|war
 * @param {string} [description]
 */
export async function setDiplomaticRelation(factionIdA, factionIdB, relationType, description = '') {
  const payload = { relationType, description };
  await Promise.all([
    setDoc(doc(db, 'factions', factionIdA, 'diplomatic', factionIdB), payload),
    setDoc(doc(db, 'factions', factionIdB, 'diplomatic', factionIdA), payload),
  ]);
}

/**
 * Remove diplomatic relation between two factions — both directions.
 * @param {string} factionIdA
 * @param {string} factionIdB
 */
export async function deleteDiplomaticRelation(factionIdA, factionIdB) {
  await Promise.all([
    deleteDoc(doc(db, 'factions', factionIdA, 'diplomatic', factionIdB)),
    deleteDoc(doc(db, 'factions', factionIdB, 'diplomatic', factionIdA)),
  ]);
}
