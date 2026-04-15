import {
  collection, addDoc, deleteDoc, doc, setDoc, query, onSnapshot,
  where, getDocs, writeBatch, serverTimestamp,
} from 'firebase/firestore';
import { db } from './config';

const COL = 'whiteboard';
const LIVE_COL = 'whiteboard_live';

export function subscribeWhiteboard(callback) {
  return onSnapshot(
    collection(db, COL),
    (snap) => { callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); },
    (err) => console.error('[Whiteboard] subscribeWhiteboard error:', err.code, err.message),
  );
}

export async function addStroke({ userId, nickname, color, points }) {
  const ref = await addDoc(collection(db, COL), {
    userId, nickname, color, points,
    createdAt: serverTimestamp(),
  });
  console.log('[Whiteboard] addStroke OK, id:', ref.id);
  return ref.id;
}

export async function deleteStrokeById(id) {
  if (!id) return;
  await deleteDoc(doc(db, COL, id));
}

export async function deleteMyStrokes(userId) {
  const q = query(collection(db, COL), where('userId', '==', userId));
  const snap = await getDocs(q);
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

export async function deleteAllStrokes() {
  const snap = await getDocs(collection(db, COL));
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

export async function updateLiveStroke(userId, nickname, color, points) {
  await setDoc(doc(db, LIVE_COL, userId), {
    userId,
    nickname,
    color,
    points,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteLiveStroke(userId) {
  await deleteDoc(doc(db, LIVE_COL, userId));
}

export function subscribeLiveStrokes(callback) {
  return onSnapshot(
    collection(db, LIVE_COL),
    (snap) => { callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); },
    (err) => console.error('[Whiteboard] subscribeLiveStrokes error:', err.code, err.message),
  );
}
