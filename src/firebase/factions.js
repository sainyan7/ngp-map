import {
  collection,
  onSnapshot,
  collectionGroup,
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
 * @param {function} callback - called with array of { id (targetFactionId), relationType, description, ... }
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
 * Each result includes the parent factionId derived from the ref path.
 * @param {function} callback - called with array of { factionId, targetFactionId, relationType, ... }
 * @returns {function} unsubscribe function
 */
export function subscribeAllDiplomaticRelations(callback) {
  return onSnapshot(collectionGroup(db, 'diplomatic'), (snapshot) => {
    const relations = snapshot.docs.map((d) => {
      // Path: factions/{factionId}/diplomatic/{targetFactionId}
      const factionId = d.ref.parent.parent.id;
      return {
        factionId,
        targetFactionId: d.id,
        ...d.data(),
      };
    });
    callback(relations);
  });
}
