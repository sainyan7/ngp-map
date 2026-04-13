import {
  collection, addDoc, deleteDoc, query, onSnapshot,
  where, getDocs, writeBatch, serverTimestamp,
} from 'firebase/firestore';
import { db } from './config';

const COL = 'whiteboard';

export function subscribeWhiteboard(callback) {
  return onSnapshot(collection(db, COL), (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function addStroke({ userId, nickname, color, points }) {
  await addDoc(collection(db, COL), {
    userId,
    nickname,
    color,
    points,
    createdAt: serverTimestamp(),
  });
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
