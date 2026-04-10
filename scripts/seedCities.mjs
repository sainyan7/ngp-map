/**
 * NGP 都市座標抽出 + Firestore 投入スクリプト
 *
 * cities.png から4種の都市マーカーを検出します：
 *   capital       : 赤■（塗りつぶし）
 *   major_city    : 赤中黒■（赤枠に黒塗り）
 *   state_capital : 青●
 *   city          : 白●
 *
 * 実行方法:
 *   --extract  : 座標を抽出して scripts/cities_draft.json に保存（Firestoreに書かない）
 *   --upload   : cities_draft.json を Firestore に投入
 *   （引数なし）: 抽出 → そのまま Firestore 投入
 *
 * セキュリティルール変更不要（匿名認証パターンを使用）。
 */

import sharp from 'sharp';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, addDoc, getDocs, writeBatch, doc, setDoc, deleteDoc } from 'firebase/firestore';

const __dir   = dirname(fileURLToPath(import.meta.url));
const MAPS    = join(__dir, '../public/maps');
const DRAFT   = join(__dir, 'cities_draft.json');
const EXTRACT = process.argv.includes('--extract');
const UPLOAD  = process.argv.includes('--upload');

// ── ベース画像サイズ（CRS.Simple 座標系の基準） ───────────────────────────
const BASE_W = 2500;
const BASE_H = 3755;

// グリッドサイズ（px）— 小さいほど細かく検出
const GRID = 3;

// ── 色フィルター ─────────────────────────────────────────────────────────
const IS_RED   = (r,g,b,a) => a>128 && r>200 && g<60  && b<60;
const IS_BLACK = (r,g,b,a) => a>128 && r<50  && g<50  && b<50;
const IS_BLUE  = (r,g,b,a) => a>128 && r<80  && g>80  && b>180;
const IS_WHITE = (r,g,b,a) => a>128 && r>200 && g>200 && b>200;

// ── ピクセル → Leaflet 座標変換 ────────────────────────────────────────────
function gridToLatLng(gx, gy, imgW, imgH) {
  const px  = (gx + 0.5) * GRID;
  const py  = (gy + 0.5) * GRID;
  const lat = BASE_H - (py * BASE_H / imgH);
  const lng = px * BASE_W / imgW;
  return { lat: Math.round(lat), lng: Math.round(lng) };
}

// ── グリッドへの集約 ────────────────────────────────────────────────────
function pixelsToGrid(data, imgW, imgH, test) {
  const cells = new Set();
  for (let py = 0; py < imgH; py++) {
    for (let px = 0; px < imgW; px++) {
      const idx = (py * imgW + px) * 4;
      if (test(data[idx], data[idx+1], data[idx+2], data[idx+3])) {
        cells.add(`${Math.floor(px/GRID)},${Math.floor(py/GRID)}`);
      }
    }
  }
  return cells;
}

// ── BFS 連結成分 ────────────────────────────────────────────────────────
function bfsComponents(cells, minSize = 2) {
  const visited = new Set();
  const comps   = [];
  for (const key of cells) {
    if (visited.has(key)) continue;
    const [gx0, gy0] = key.split(',').map(Number);
    const comp = [];
    const queue = [[gx0, gy0]];
    visited.add(key);
    while (queue.length) {
      const [gx, gy] = queue.shift();
      comp.push([gx, gy]);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nk = `${gx+dx},${gy+dy}`;
          if (!visited.has(nk) && cells.has(nk)) {
            visited.add(nk);
            queue.push([gx+dx, gy+dy]);
          }
        }
      }
    }
    if (comp.length >= minSize) comps.push(comp);
  }
  return comps;
}

// ── 重心計算 ────────────────────────────────────────────────────────────
function centroid(comp) {
  const [sx, sy] = comp.reduce(([ax,ay],[x,y]) => [ax+x, ay+y], [0,0]);
  return [sx / comp.length, sy / comp.length];
}

// ── 都市抽出メイン ─────────────────────────────────────────────────────
async function extractCities() {
  console.log('📍 cities.png を解析中...');
  const { data, info } = await sharp(join(MAPS, 'cities.png'))
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  console.log(`   画像サイズ: ${W}×${H}`);

  // ── 赤ピクセルと黒ピクセルのグリッドを取得 ────────────────────────────
  const redCells   = pixelsToGrid(data, W, H, IS_RED);
  const blackCells = pixelsToGrid(data, W, H, IS_BLACK);
  const blueCells  = pixelsToGrid(data, W, H, IS_BLUE);
  const whiteCells = pixelsToGrid(data, W, H, IS_WHITE);

  // ── 赤+黒の複合グリッド（capital / major_city 判定用） ─────────────────
  const redOrBlack = new Set([...redCells, ...blackCells]);
  const rbComps    = bfsComponents(redOrBlack, 3);

  const capitals   = [];
  const majorCities = [];

  rbComps.forEach(comp => {
    const redCount   = comp.filter(([x,y]) => redCells.has(`${x},${y}`)).length;
    const blackCount = comp.filter(([x,y]) => blackCells.has(`${x},${y}`)).length;
    const [cx, cy]   = centroid(comp);
    const pos        = gridToLatLng(cx, cy, W, H);

    if (blackCount > 0 && redCount > 0) {
      // 赤枠 + 黒内部 → major_city
      majorCities.push({ type: 'major_city', ...pos, name: '' });
    } else if (redCount > 0) {
      // 赤のみ → capital
      capitals.push({ type: 'capital', ...pos, name: '' });
    }
  });

  // ── 青：州都 ────────────────────────────────────────────────────────────
  const blueComps = bfsComponents(blueCells, 2);
  const stateCapitals = blueComps.map(comp => {
    const [cx, cy] = centroid(comp);
    return { type: 'state_capital', ...gridToLatLng(cx, cy, W, H), name: '' };
  });

  // ── 白：その他の都市 ─────────────────────────────────────────────────────
  // 白ピクセルから赤/青に近いものを除外（マーカー縁の白ハイライトを弾く）
  const pureWhite = new Set();
  for (const key of whiteCells) {
    const [gx, gy] = key.split(',').map(Number);
    // 周囲3グリッドに赤や青がなければ純粋な白マーカー
    let hasColoredNeighbor = false;
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const nk = `${gx+dx},${gy+dy}`;
        if (redCells.has(nk) || blueCells.has(nk)) {
          hasColoredNeighbor = true;
          break;
        }
      }
      if (hasColoredNeighbor) break;
    }
    if (!hasColoredNeighbor) pureWhite.add(key);
  }
  const whiteComps = bfsComponents(pureWhite, 2);
  const otherCities = whiteComps.map(comp => {
    const [cx, cy] = centroid(comp);
    return { type: 'city', ...gridToLatLng(cx, cy, W, H), name: '' };
  });

  const all = [...capitals, ...majorCities, ...stateCapitals, ...otherCities];

  console.log(`  首都(capital):       ${capitals.length} 件`);
  console.log(`  大都市(major_city):  ${majorCities.length} 件`);
  console.log(`  州都(state_capital): ${stateCapitals.length} 件`);
  console.log(`  その他(city):        ${otherCities.length} 件`);
  console.log(`  合計:                ${all.length} 件`);

  return all;
}

// ── Firestore クリア ──────────────────────────────────────────────────────
async function clearCollection(db, name) {
  const snap = await getDocs(collection(db, name));
  if (snap.empty) return;
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += 400) {
    const batch = writeBatch(db);
    docs.slice(i, i+400).forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
  console.log(`  🗑️  ${name}: ${docs.length} 件削除`);
}

// ── Firestore アップロード ────────────────────────────────────────────────
async function upload(cities) {
  const cfg = {
    apiKey:            process.env.VITE_FIREBASE_API_KEY,
    authDomain:        process.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId:         process.env.VITE_FIREBASE_PROJECT_ID,
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId:             process.env.VITE_FIREBASE_APP_ID,
  };
  const app  = initializeApp(cfg);
  const db   = getFirestore(app);
  const auth = getAuth(app);

  // 匿名認証 + userRoles 書き込み
  const cred = await signInAnonymously(auth);
  const uid  = cred.user.uid;
  await setDoc(doc(db, 'userRoles', uid), { authenticated: true });
  console.log(`  🔑 匿名認証完了 (uid: ${uid})`);

  try {
    console.log('\n🔥 Firestore へアップロード中...');
    await clearCollection(db, 'cities');
    for (const city of cities) {
      await addDoc(collection(db, 'cities'), city);
    }
    console.log(`  ✅ cities: ${cities.length} 件 投入完了`);
  } finally {
    // 後片付け
    await deleteDoc(doc(db, 'userRoles', uid));
    console.log('  🧹 userRoles クリーンアップ完了');
  }
  console.log('\n✅ 完了！');
}

// ── メイン ────────────────────────────────────────────────────────────────
async function main() {
  // --upload のみ：既存 draft を使ってアップロード
  if (UPLOAD && !EXTRACT) {
    if (!existsSync(DRAFT)) {
      console.error('❌ cities_draft.json が見つかりません。先に --extract を実行してください。');
      process.exit(1);
    }
    const cities = JSON.parse(readFileSync(DRAFT, 'utf-8'));
    console.log(`📂 ${DRAFT} から ${cities.length} 件を読み込みました`);
    await upload(cities);
    process.exit(0);
  }

  // 抽出
  const cities = await extractCities();

  // --extract：JSON 保存のみ
  if (EXTRACT) {
    writeFileSync(DRAFT, JSON.stringify(cities, null, 2), 'utf-8');
    console.log(`\n💾 ${DRAFT} に保存しました。`);
    console.log('   name フィールドに都市名を入力後、--upload で Firestore に投入できます。');
    process.exit(0);
  }

  // デフォルト：そのまま Firestore 投入
  await upload(cities);
  process.exit(0);
}

main().catch(err => {
  console.error('❌ 失敗:', err);
  process.exit(1);
});
