/**
 * NGP Firestore シードスクリプト
 *
 * 実行前に以下を行ってください:
 * 1. Firestoreのセキュリティルールを一時的に公開書き込み許可に変更:
 *    rules_version = '2';
 *    service cloud.firestore {
 *      match /databases/{database}/documents {
 *        match /{document=**} { allow read, write: if true; }
 *      }
 *    }
 * 2. 下記 FIREBASE_CONFIG の値をあなたのFirebaseプロジェクトの値に変更
 * 3. 実行: node scripts/seedFirestore.mjs
 * 4. 完了後、Firestoreセキュリティルールを元に戻す
 *
 * ※ 座標はbase.png（2500×3755px）のCRS.Simple座標系
 *   lat = 画像上端からの距離（上=高lat、下=低lat）
 *   lng = 画像左端からの距離（左=低lng、右=高lng）
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, writeBatch, doc } from 'firebase/firestore';

// ── Firebase設定（あなたの値に書き換えてください） ─────────────────────────
const FIREBASE_CONFIG = {
  apiKey:            process.env.VITE_FIREBASE_API_KEY            ?? 'YOUR_API_KEY',
  authDomain:        process.env.VITE_FIREBASE_AUTH_DOMAIN        ?? 'YOUR_AUTH_DOMAIN',
  projectId:         process.env.VITE_FIREBASE_PROJECT_ID         ?? 'YOUR_PROJECT_ID',
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? 'YOUR_SENDER_ID',
  appId:             process.env.VITE_FIREBASE_APP_ID             ?? 'YOUR_APP_ID',
};

// ── 都市データ ─────────────────────────────────────────────────────────────
// type: 'capital'=首都（赤■）, 'major'=100万人以上（青●大）, 'city'=その他（青●小）
// 座標はmark.pngを参考に目視で推定。実際の地図に合わせて調整してください。
const CITIES = [
  // 首都
  { name: 'ソルエンポリス', type: 'capital', lat: 3041, lng: 375,  population: 2800000 },
  { name: 'サンレイ',       type: 'capital', lat: 2253, lng: 550,  population: 3200000 },
  { name: 'ラディーナ',     type: 'capital', lat: 2629, lng: 475,  population: 1800000 },
  // 大都市（100万人以上）
  { name: 'ランフォード',   type: 'major',   lat: 2816, lng: 425,  population: 1400000 },
  { name: 'エルミナ',       type: 'major',   lat: 2103, lng: 500,  population: 1200000 },
  { name: 'ラヴィル',       type: 'major',   lat: 2216, lng: 750,  population: 1100000 },
  { name: 'グルームベリー', type: 'major',   lat: 1990, lng: 650,  population: 1050000 },
  { name: 'ブース',         type: 'major',   lat: 1802, lng: 525,  population: 1300000 },
  // 一般都市
  { name: 'ポートブール',   type: 'city',    lat: 1577, lng: 300,  population: 650000  },
  { name: 'クラウバーゼル', type: 'city',    lat: 1502, lng: 550,  population: 720000  },
  { name: 'シェンハーフェン', type: 'city',  lat: 1277, lng: 475,  population: 480000  },
  { name: 'ホーフリール',   type: 'city',    lat:  977, lng: 450,  population: 390000  },
  { name: 'チャキァタス',   type: 'city',    lat:  714, lng: 375,  population: 280000  },
  { name: 'ラシェベソエ',   type: 'city',    lat:  488, lng: 350,  population: 210000  },
  { name: 'エンバスガム',   type: 'city',    lat:  263, lng: 250,  population: 150000  },
];

// ── 道路・鉄道・州境データ ────────────────────────────────────────────────
// type: 'highway'=高速道路, 'highspeed_rail'=高速鉄道, 'railway'=幹線鉄道, 'border'=州境
// points: [{lat,lng},...] ※Firestoreは入れ子配列不可のためオブジェクト配列で保存
const ROADS = [
  // ── 高速道路 ────────────────────────────────────────────────────────────
  {
    name: '北部縦断高速',
    type: 'highway',
    points: [
      { lat: 3041, lng: 375 },  // ソルエンポリス
      { lat: 2816, lng: 425 },  // ランフォード
      { lat: 2629, lng: 475 },  // ラディーナ
      { lat: 2253, lng: 550 },  // サンレイ
    ],
  },
  {
    name: '南部縦断高速',
    type: 'highway',
    points: [
      { lat: 2253, lng: 550 },  // サンレイ
      { lat: 1802, lng: 525 },  // ブース
      { lat: 1502, lng: 550 },  // クラウバーゼル
      { lat: 1277, lng: 475 },  // シェンハーフェン
      { lat:  977, lng: 450 },  // ホーフリール
      { lat:  714, lng: 375 },  // チャキァタス
    ],
  },
  {
    name: '東西横断高速',
    type: 'highway',
    points: [
      { lat: 2253, lng: 550 },  // サンレイ
      { lat: 2216, lng: 750 },  // ラヴィル
    ],
  },
  {
    name: '西部海岸高速',
    type: 'highway',
    points: [
      { lat: 2629, lng: 475 },  // ラディーナ
      { lat: 2103, lng: 500 },  // エルミナ
      { lat: 1577, lng: 300 },  // ポートブール
      { lat: 1277, lng: 475 },  // シェンハーフェン
    ],
  },

  // ── 高速鉄道 ────────────────────────────────────────────────────────────
  {
    name: '北部新幹線',
    type: 'highspeed_rail',
    points: [
      { lat: 3041, lng: 375 },  // ソルエンポリス
      { lat: 2816, lng: 425 },  // ランフォード
      { lat: 2629, lng: 475 },  // ラディーナ
      { lat: 2253, lng: 550 },  // サンレイ
      { lat: 2103, lng: 500 },  // エルミナ
    ],
  },
  {
    name: '中部新幹線',
    type: 'highspeed_rail',
    points: [
      { lat: 2253, lng: 550 },  // サンレイ
      { lat: 1990, lng: 650 },  // グルームベリー
      { lat: 2216, lng: 750 },  // ラヴィル
    ],
  },
  {
    name: '南部新幹線',
    type: 'highspeed_rail',
    points: [
      { lat: 2253, lng: 550 },  // サンレイ
      { lat: 1802, lng: 525 },  // ブース
      { lat: 1502, lng: 550 },  // クラウバーゼル
      { lat:  977, lng: 450 },  // ホーフリール
    ],
  },

  // ── 幹線鉄道 ────────────────────────────────────────────────────────────
  {
    name: '西海岸本線',
    type: 'railway',
    points: [
      { lat: 2816, lng: 425 },  // ランフォード
      { lat: 2103, lng: 500 },  // エルミナ
      { lat: 1802, lng: 525 },  // ブース
      { lat: 1577, lng: 300 },  // ポートブール
      { lat: 1502, lng: 550 },  // クラウバーゼル
      { lat: 1277, lng: 475 },  // シェンハーフェン
      { lat:  977, lng: 450 },  // ホーフリール
      { lat:  714, lng: 375 },  // チャキァタス
      { lat:  488, lng: 350 },  // ラシェベソエ
      { lat:  263, lng: 250 },  // エンバスガム
    ],
  },
  {
    name: '東部横断線',
    type: 'railway',
    points: [
      { lat: 2216, lng: 750 },  // ラヴィル
      { lat: 1990, lng: 650 },  // グルームベリー
      { lat: 1802, lng: 525 },  // ブース
      { lat: 1502, lng: 550 },  // クラウバーゼル
    ],
  },
  {
    name: '北部環状線',
    type: 'railway',
    points: [
      { lat: 3041, lng: 375 },  // ソルエンポリス
      { lat: 2816, lng: 425 },  // ランフォード
      { lat: 1990, lng: 650 },  // グルームベリー
      { lat: 2216, lng: 750 },  // ラヴィル
    ],
  },

  // ── 州境線 ──────────────────────────────────────────────────────────────
  {
    name: '北部州境',
    type: 'border',
    points: [
      { lat: 3200, lng: 200 },
      { lat: 3100, lng: 380 },
      { lat: 3041, lng: 375 },  // ソルエンポリス付近
      { lat: 2950, lng: 500 },
      { lat: 2900, lng: 650 },
      { lat: 2850, lng: 900 },
    ],
  },
  {
    name: '中部州境',
    type: 'border',
    points: [
      { lat: 2450, lng: 100 },
      { lat: 2350, lng: 300 },
      { lat: 2253, lng: 550 },  // サンレイ付近
      { lat: 2200, lng: 800 },
      { lat: 2100, lng: 1100 },
    ],
  },
  {
    name: '南部州境',
    type: 'border',
    points: [
      { lat: 1450, lng: 150 },
      { lat: 1350, lng: 350 },
      { lat: 1277, lng: 475 },  // シェンハーフェン付近
      { lat: 1200, lng: 700 },
      { lat: 1100, lng: 1000 },
    ],
  },
];

// ── メイン処理 ────────────────────────────────────────────────────────────
async function seed() {
  const app = initializeApp(FIREBASE_CONFIG);
  const db  = getFirestore(app);

  console.log('📍 都市データを投入中...');
  for (const city of CITIES) {
    await addDoc(collection(db, 'cities'), city);
    console.log(`  ✓ ${city.name}`);
  }

  console.log('🛣️  道路・鉄道・州境データを投入中...');
  for (const road of ROADS) {
    await addDoc(collection(db, 'roads'), road);
    console.log(`  ✓ ${road.name}（${road.type}）`);
  }

  console.log('\n✅ シード完了！Firestoreのセキュリティルールを元に戻してください。');
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ シード失敗:', err);
  process.exit(1);
});
