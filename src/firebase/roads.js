import { collection, onSnapshot } from 'firebase/firestore';
import { db } from './config';

/**
 * Subscribe to all roads/railways/borders with real-time updates.
 * Each doc: { name, type: 'highway'|'highspeed_rail'|'railway'|'border', points: [{lat,lng},...] }
 */
export function subscribeRoads(callback) {
  return onSnapshot(collection(db, 'roads'), (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}
