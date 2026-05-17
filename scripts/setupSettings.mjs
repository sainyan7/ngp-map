/**
 * scripts/setupSettings.mjs
 *
 * Firestore /settings/main にグループ・管理者パスワードのSHA-256ハッシュを書き込む。
 * Firebase CLIログイン不要。Firebase client SDKのみ使用。
 *
 * 仕組み:
 *   1. 匿名ログイン
 *   2. 自分の userRoles/{uid} を { admin: true } で書く（ルール上許可されている）
 *   3. settings/main を書く（isAdmin() = true になったため許可される）
 *   4. userRoles/{uid} を削除（後片付け）
 *
 * Usage:
 *   node scripts/setupSettings.mjs
 */

import { readFileSync } from 'fs';
import { createInterface } from 'readline';
import { createHash } from 'crypto';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, setDoc, deleteDoc } from 'firebase/firestore';

// ── .env を手動パース ─────────────────────────────────────────────────────────
function loadEnv() {
  const content = readFileSync('.env', 'utf-8');
  const env = {};
  for (const line of content.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.+)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

// ── SHA-256 (Node built-in) ───────────────────────────────────────────────────
function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

// ── 対話入力（非表示にはしない） ─────────────────────────────────────────────
function prompt(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

// ── メイン ────────────────────────────────────────────────────────────────────
async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  console.log('\n=== NGP Map セットアップ ===\n');
  console.log('Firestoreに /settings/main を作成します。');
  console.log('グループ全員が使う共通パスワードと、管理者専用パスワードを設定します。\n');

  const groupPassword = (await prompt(rl, 'グループパスワード (全員共通): ')).trim();
  const adminPassword  = (await prompt(rl, '管理者パスワード (あなただけ): ')).trim();
  rl.close();

  if (!groupPassword || !adminPassword) {
    console.error('❌ パスワードが空です。中断します。');
    process.exit(1);
  }
  if (groupPassword === adminPassword) {
    console.error('❌ グループパスワードと管理者パスワードは異なる値にしてください。');
    process.exit(1);
  }

  const groupPasswordHash = sha256(groupPassword);
  const adminPasswordHash  = sha256(adminPassword);

  console.log('\n📋 ハッシュ計算完了');

  // Firebase初期化
  const env = loadEnv();
  const firebaseConfig = {
    apiKey:            env.VITE_FIREBASE_API_KEY,
    authDomain:        env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId:         env.VITE_FIREBASE_PROJECT_ID,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId:             env.VITE_FIREBASE_APP_ID,
  };

  const app  = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db   = getFirestore(app);

  // Step 1: 匿名ログイン
  console.log('🔐 Firebase匿名ログイン中...');
  const { user } = await signInAnonymously(auth);
  const { uid } = user;
  console.log(`   uid: ${uid}`);

  try {
    // Step 2: 自分のuserRolesにadmin権限を付与（ルール上、自分のuidには書ける）
    console.log('🔑 一時的にadmin権限を付与中...');
    await setDoc(doc(db, 'userRoles', uid), {
      authenticated: true,
      admin: true,
      nickname: 'setup-script',
      updatedAt: new Date().toISOString(),
    });

    // Step 3: settings/main を書き込み（isAdmin() = true になったため許可）
    console.log('✏️  /settings/main に書き込み中...');
    await setDoc(doc(db, 'settings', 'main'), {
      groupPasswordHash,
      adminPasswordHash,
      updatedAt: new Date().toISOString(),
    });

    console.log('✅ /settings/main の書き込み完了！');

  } finally {
    // Step 4: 後片付け（一時admin権限を削除）
    console.log('🧹 一時データを削除中...');
    await deleteDoc(doc(db, 'userRoles', uid)).catch(() => {});
  }

  console.log('\n========================================');
  console.log('✅ セットアップ完了！\n');
  console.log('【次の手順】');
  console.log('');
  console.log('① Firebase Console でドメイン承認（まだなら）');
  console.log('   https://console.firebase.google.com');
  console.log('   → Authentication → Settings → Authorized domains');
  console.log('   → 「Add domain」→ sainyan7.github.io を追加');
  console.log('');
  console.log('② Firestoreルールのデプロイ（まだなら）');
  console.log('   firebase login');
  console.log('   firebase use --add   (プロジェクトIDを選択)');
  console.log('   firebase deploy --only firestore:rules');
  console.log('');
  console.log('③ テスターへ共有する情報:');
  console.log('   URL: https://sainyan7.github.io/ngp-map/');
  console.log(`   グループパスワード: ${groupPassword}`);
  console.log('========================================\n');

  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ エラー:', err.message ?? err);
  process.exit(1);
});
