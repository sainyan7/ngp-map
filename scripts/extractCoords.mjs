/**
 * NGP 画像座標抽出 + Firestore アップロードスクリプト
 *
 * public/maps/ 以下のトレース画像から都市・道路の座標を抽出し、
 * Firestore の cities / roads コレクションに投入します。
 *
 * 実行前準備:
 *   1. Firestore セキュリティルールを一時的に公開書き込みに変更
 *   2. node --env-file=.env scripts/extractCoords.mjs
 *   3. 完了後、Firestore セキュリティルールを元に戻す
 *
 * オプション:
 *   --analyze  : 各画像の色分布を調べるだけ（Firestore には書き込まない）
 *   --dry-run  : 抽出結果をコンソール表示するだけ（Firestore には書き込まない）
 */

import sharp from 'sharp';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, writeBatch } from 'firebase/firestore';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir   = dirname(fileURLToPath(import.meta.url));
const MAPS    = join(__dir, '../public/maps');
const IS_DRY  = process.argv.includes('--dry-run');
const ANALYZE = process.argv.includes('--analyze');

// ── ベース画像サイズ ─────────────────────────────────────────────────────────
const BASE_W = 2500;
const BASE_H = 3755;

// ── グリッドサイズ（厚いラインを1点に集約するセルサイズ） ───────────────────
const ROAD_GRID = 20;   // 道路・鉄道・州境：20px セル
const CITY_GRID = 6;    // 都市マーカー：6px セル

// ── 色フィルター（各画像のトレース色に合わせて調整） ──────────────────────
// 各関数は (R, G, B, A) を受け取り true/false を返す
const FILTERS = {
  // cities.png — 赤=首都 rgb(256,16,0), 青=都市 rgb(32,128,256)
  capital  : (r,g,b,a) => a>128 && r>200 && g<60  && b<60,
  city_blue: (r,g,b,a) => a>128 && r<80  && g>80  && b>180,

  // highway.png — 赤 rgb(240,32,32) + 黄 rgb(256,224,80) の2色で描画
  highway  : (r,g,b,a) => a>128 && r>180 && b<100 && (g<80 || g>160),

  // highspeed_rail.png — 黒 rgb(0,0,0)
  highspeed_rail: (r,g,b,a) => a>128 && r<40  && g<40  && b<40,

  // railway.png — 濃紺 rgb(32,32,64)：B が R・G より明確に高い
  railway  : (r,g,b,a) => a>128 && r<80  && g<80  && b>40 && b > r+15,

  // border.png — マゼンタ rgb(224,80,208)：R と B が高く G が低い
  border   : (r,g,b,a) => a>128 && r>140 && g<130 && b>140,
};

// ── ピクセルデータ取得 ────────────────────────────────────────────────────
async function loadImage(filename) {
  const { data, info } = await sharp(join(MAPS, filename))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

// ── 色分布分析（--analyze 用） ────────────────────────────────────────────
async function analyzeImage(filename) {
  const { data, w, h } = await loadImage(filename);
  const buckets = {};
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
    if (a < 128) continue;
    // 16-step 量子化
    const key = `${Math.round(r/16)*16},${Math.round(g/16)*16},${Math.round(b/16)*16}`;
    buckets[key] = (buckets[key] || 0) + 1;
  }
  const sorted = Object.entries(buckets)
    .filter(([,n]) => n > 50)
    .sort((a,b) => b[1]-a[1])
    .slice(0, 20);
  console.log(`\n📊 ${filename} (${w}×${h}) — 上位色:`);
  sorted.forEach(([rgb, n]) => {
    const [r,g,b] = rgb.split(',').map(Number);
    console.log(`  rgb(${rgb.padEnd(12)}) : ${n.toString().padStart(7)} px`);
  });
}

// ── 有色ピクセルをグリッドセルに集約 ──────────────────────────────────────
function pixelsToGrid(data, imgW, imgH, colorTest, gridSize) {
  const cells = new Map(); // "gx,gy" → count
  for (let py = 0; py < imgH; py++) {
    for (let px = 0; px < imgW; px++) {
      const idx = (py * imgW + px) * 4;
      const r = data[idx], g = data[idx+1], b = data[idx+2], a = data[idx+3];
      if (!colorTest(r,g,b,a)) continue;
      const gx = Math.floor(px / gridSize);
      const gy = Math.floor(py / gridSize);
      const key = `${gx},${gy}`;
      cells.set(key, (cells.get(key) || 0) + 1);
    }
  }
  return cells;
}

// ── BFS で連結成分を抽出 ──────────────────────────────────────────────────
function bfsComponents(cells) {
  const visited = new Set();
  const components = [];

  for (const key of cells.keys()) {
    if (visited.has(key)) continue;
    const [gx0, gy0] = key.split(',').map(Number);

    const comp = [];
    const queue = [[gx0, gy0]];
    visited.add(key);

    while (queue.length > 0) {
      const [gx, gy] = queue.shift();
      comp.push([gx, gy]);

      // 8近傍
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nk = `${gx+dx},${gy+dy}`;
          if (!visited.has(nk) && cells.has(nk)) {
            visited.add(nk);
            queue.push([gx+dx, gy+dy]);
          }
        }
      }
    }
    components.push(comp);
  }
  return components;
}

// ── 最近傍順でセルを並べ替えてポリライン化 ─────────────────────────────────
function sortCellsAsPolyline(cells) {
  if (cells.length <= 2) return cells;

  // 開始点：最も y が小さい（最上部）セル
  const remaining = [...cells];
  remaining.sort((a,b) => a[1]-b[1] || a[0]-b[0]);
  const ordered = [remaining.shift()];

  while (remaining.length > 0) {
    const [lx, ly] = ordered[ordered.length - 1];
    let minDist = Infinity;
    let minIdx  = 0;
    for (let i = 0; i < remaining.length; i++) {
      const [nx, ny] = remaining[i];
      const d = (nx-lx)**2 + (ny-ly)**2;
      if (d < minDist) { minDist = d; minIdx = i; }
    }
    ordered.push(remaining.splice(minIdx, 1)[0]);
  }
  return ordered;
}

// ── Douglas–Peucker 簡略化 ────────────────────────────────────────────────
function douglasPeucker(pts, eps) {
  if (pts.length <= 2) return pts;
  const [x1,y1] = pts[0];
  const [x2,y2] = pts[pts.length-1];
  const len = Math.hypot(x2-x1, y2-y1);

  let maxD = 0, maxI = 0;
  for (let i = 1; i < pts.length-1; i++) {
    const [px,py] = pts[i];
    const d = len === 0
      ? Math.hypot(px-x1, py-y1)
      : Math.abs((y2-y1)*px - (x2-x1)*py + x2*y1 - y2*x1) / len;
    if (d > maxD) { maxD = d; maxI = i; }
  }
  if (maxD > eps) {
    const L = douglasPeucker(pts.slice(0, maxI+1), eps);
    const R = douglasPeucker(pts.slice(maxI), eps);
    return [...L.slice(0,-1), ...R];
  }
  return [pts[0], pts[pts.length-1]];
}

// ── グリッド座標 → Leaflet 座標 ──────────────────────────────────────────
function gridToLatLng(gx, gy, gridSize, imgW, imgH) {
  const px = (gx + 0.5) * gridSize;
  const py = (gy + 0.5) * gridSize;
  const lat = BASE_H - (py * BASE_H / imgH);
  const lng  = px * BASE_W / imgW;
  return { lat: Math.round(lat), lng: Math.round(lng) };
}

// ── 都市抽出 ────────────────────────────────────────────────────────────
async function extractCities() {
  console.log('\n📍 cities.png を解析中...');
  const { data, w, h } = await loadImage('cities.png');

  // 首都（赤）
  const capitalCells = pixelsToGrid(data, w, h, FILTERS.capital, CITY_GRID);
  const capitalComps = bfsComponents(capitalCells).filter(c => c.length >= 2);

  // 都市（青）— サイズで major / city を区別
  const blueCells  = pixelsToGrid(data, w, h, FILTERS.city_blue, CITY_GRID);
  const blueComps  = bfsComponents(blueCells).filter(c => c.length >= 2);

  // blue の中で上位 40% をまず major 候補とし、しきい値を計算
  const sizes      = blueComps.map(c => c.length).sort((a,b) => b-a);
  const threshold  = sizes[Math.floor(sizes.length * 0.4)] ?? 0;

  const cities = [];

  capitalComps.forEach((comp, i) => {
    const [cx, cy] = comp.reduce(([sx,sy],[x,y])=>[sx+x,sy+y],[0,0])
                         .map((v,j) => v / comp.length);
    cities.push({
      name: `首都${i+1}`,
      type: 'capital',
      ...gridToLatLng(cx, cy, CITY_GRID, w, h),
      population: 0,
    });
  });

  blueComps.forEach((comp, i) => {
    const [cx, cy] = comp.reduce(([sx,sy],[x,y])=>[sx+x,sy+y],[0,0])
                         .map((v,j) => v / comp.length);
    const type = comp.length >= threshold ? 'major' : 'city';
    cities.push({
      name: type === 'major' ? `大都市${i+1}` : `都市${i+1}`,
      type,
      ...gridToLatLng(cx, cy, CITY_GRID, w, h),
      population: 0,
    });
  });

  console.log(`  首都: ${capitalComps.length} 件, 大都市/都市: ${blueComps.length} 件`);
  return cities;
}

// ── 道路・鉄道・州境抽出（汎用） ─────────────────────────────────────────
async function extractRoads(filename, type, colorTest, minCellCount = 3) {
  console.log(`\n🛣️  ${filename} (${type}) を解析中...`);
  const { data, w, h } = await loadImage(filename);

  const cells = pixelsToGrid(data, w, h, colorTest, ROAD_GRID);
  const comps  = bfsComponents(cells).filter(c => c.length >= minCellCount);

  console.log(`  連結成分: ${comps.length} 本`);

  const roads = comps.map((comp, i) => {
    const sorted   = sortCellsAsPolyline(comp);
    const simplified = douglasPeucker(sorted, 1.5); // グリッド単位の epsilon
    const points   = simplified.map(([gx,gy]) => gridToLatLng(gx, gy, ROAD_GRID, w, h));
    return {
      name: `${type}_${i+1}`,
      type,
      points,
    };
  });

  return roads;
}

// ── Firestore クリア ──────────────────────────────────────────────────────
async function clearCollection(db, name) {
  const snap = await getDocs(collection(db, name));
  if (snap.empty) return;
  const docs  = snap.docs;
  for (let i = 0; i < docs.length; i += 400) {
    const batch = writeBatch(db);
    docs.slice(i, i+400).forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
  console.log(`  🗑️  ${name}: ${docs.length} 件削除`);
}

// ── メイン ────────────────────────────────────────────────────────────────
async function main() {

  // ── --analyze モード ────────────────────────────────────────────────────
  if (ANALYZE) {
    for (const f of ['cities.png','highway.png','highspeed_rail.png','railway.png','border.png']) {
      await analyzeImage(f);
    }
    console.log('\n上記の色情報を参考に、スクリプト先頭の FILTERS を調整してください。');
    process.exit(0);
  }

  // ── 抽出 ────────────────────────────────────────────────────────────────
  const cities = await extractCities();

  const roads = [
    ...await extractRoads('highway.png',        'highway',        FILTERS.highway,        20),
    ...await extractRoads('highspeed_rail.png', 'highspeed_rail', FILTERS.highspeed_rail, 15),
    ...await extractRoads('railway.png',        'railway',        FILTERS.railway,        20),
    ...await extractRoads('border.png',         'border',         FILTERS.border,        20),
  ];

  // ── --dry-run: 表示のみ ─────────────────────────────────────────────────
  if (IS_DRY) {
    console.log('\n── 都市 ──────────────────────────────────────');
    cities.forEach(c => console.log(` [${c.type}] ${c.name}  lat=${c.lat} lng=${c.lng}`));
    console.log('\n── 道路・鉄道・州境 ──────────────────────────');
    roads.forEach(r => console.log(` [${r.type}] ${r.name}  ${r.points.length} 点`));
    console.log(`\n合計: 都市 ${cities.length} 件 / 路線 ${roads.length} 本`);
    process.exit(0);
  }

  // ── Firestore アップロード ──────────────────────────────────────────────
  const firebaseConfig = {
    apiKey:            process.env.VITE_FIREBASE_API_KEY,
    authDomain:        process.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId:         process.env.VITE_FIREBASE_PROJECT_ID,
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId:             process.env.VITE_FIREBASE_APP_ID,
  };

  const app = initializeApp(firebaseConfig);
  const db  = getFirestore(app);

  console.log('\n🔥 Firestore へアップロード中...');
  await clearCollection(db, 'cities');
  for (const city of cities) {
    await addDoc(collection(db, 'cities'), city);
  }
  console.log(`  ✅ cities: ${cities.length} 件 投入完了`);

  await clearCollection(db, 'roads');
  for (const road of roads) {
    await addDoc(collection(db, 'roads'), road);
  }
  console.log(`  ✅ roads: ${roads.length} 本 投入完了`);

  const byType = roads.reduce((a,r) => { a[r.type]=(a[r.type]||0)+1; return a; }, {});
  Object.entries(byType).forEach(([t,n]) => console.log(`    ${t}: ${n} 本`));

  console.log('\n✅ 完了！Firestore のセキュリティルールを元に戻してください。');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ 失敗:', err);
  process.exit(1);
});
