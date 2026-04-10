/**
 * NGP Firestore アップロードスクリプト（画像抽出データ用）
 *
 * extractCoords.py で生成した extracted_cities.json と
 * extracted_roads.json を Firestore の cities / roads コレクションに投入します。
 * 既存ドキュメントは全削除してから投入し直します。
 *
 * 実行前準備:
 *   1. python scripts/extractCoords.py を実行して JSON を生成
 *   2. Firestore セキュリティルールを一時的に公開書き込みに変更
 *   3. 実行: node --env-file=.env scripts/uploadExtracted.mjs
 *   4. 完了後、Firestore セキュリティルールを元に戻す
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  writeBatch,
} from 'firebase/firestore';

const __dir = dirname(fileURLToPath(import.meta.url));

// ── Firebase 設定 ───────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            process.env.VITE_FIREBASE_API_KEY,
  authDomain:        process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.VITE_FIREBASE_APP_ID,
};

// ── 既存コレクションを全削除 ───────────────────────────────────────────────
async function clearCollection(db, collectionName) {
  const snap = await getDocs(collection(db, collectionName));
  if (snap.empty) return;

  // Firestore の writeBatch は 500 件まで
  const chunks = [];
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += 400) {
    chunks.push(docs.slice(i, i + 400));
  }
  for (const chunk of chunks) {
    const batch = writeBatch(db);
    chunk.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  console.log(`  🗑️  ${collectionName}: ${docs.length} 件削除`);
}

// ── メイン ──────────────────────────────────────────────────────────────────
async function main() {
  const app = initializeApp(firebaseConfig);
  const db  = getFirestore(app);

  // ── 都市データ ─────────────────────────────────────────────────────────────
  const citiesPath = join(__dir, 'extracted_cities.json');
  let cities;
  try {
    cities = JSON.parse(readFileSync(citiesPath, 'utf-8'));
  } catch (e) {
    console.error('❌ extracted_cities.json が見つかりません。先に extractCoords.py を実行してください。');
    process.exit(1);
  }

  console.log(`\n📍 都市データを投入中 (${cities.length} 件)...`);
  await clearCollection(db, 'cities');
  for (const city of cities) {
    await addDoc(collection(db, 'cities'), city);
  }
  console.log(`  ✅ cities: ${cities.length} 件 投入完了`);

  // ── 道路・鉄道・州境データ ────────────────────────────────────────────────
  const roadsPath = join(__dir, 'extracted_roads.json');
  let roads;
  try {
    roads = JSON.parse(readFileSync(roadsPath, 'utf-8'));
  } catch (e) {
    console.error('❌ extracted_roads.json が見つかりません。先に extractCoords.py を実行してください。');
    process.exit(1);
  }

  console.log(`\n🛣️  道路・鉄道・州境データを投入中 (${roads.length} 本)...`);
  await clearCollection(db, 'roads');

  const byType = roads.reduce((acc, r) => {
    acc[r.type] = (acc[r.type] || 0) + 1;
    return acc;
  }, {});

  for (const road of roads) {
    await addDoc(collection(db, 'roads'), road);
  }

  console.log('  ✅ roads 投入完了:');
  Object.entries(byType).forEach(([type, count]) => {
    console.log(`    ${type}: ${count} 本`);
  });

  console.log('\n✅ アップロード完了！Firestore セキュリティルールを元に戻してください。');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ アップロード失敗:', err);
  process.exit(1);
});
