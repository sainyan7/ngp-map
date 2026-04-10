#!/usr/bin/env python3
"""
NGP Map - Coordinate Extractor
================================
トレース画像からピクセル座標を抽出し、Leaflet座標に変換してJSONに出力します。

依存パッケージのインストール:
    pip install Pillow numpy scipy scikit-image

実行方法:
    cd ngp-map
    python scripts/extractCoords.py

出力ファイル:
    scripts/extracted_cities.json
    scripts/extracted_roads.json  (highway / highspeed_rail / railway / border を含む)
"""

import json
import sys
import numpy as np
from pathlib import Path
from PIL import Image
from scipy import ndimage

try:
    from skimage.morphology import skeletonize
    HAS_SKIMAGE = True
except ImportError:
    HAS_SKIMAGE = False
    print("⚠️  scikit-image が見つかりません。pip install scikit-image を実行してください。", file=sys.stderr)
    sys.exit(1)

# ── パス設定 ────────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).parent
MAPS_DIR   = SCRIPT_DIR.parent / "public" / "maps"
OUT_DIR    = SCRIPT_DIR

# base.png のサイズ（Leaflet座標系の基準）
BASE_W = 2500
BASE_H = 3755


# ── 座標変換 ─────────────────────────────────────────────────────────────────
def to_leaflet(px: float, py: float, img_w: int, img_h: int) -> dict:
    """
    画像ピクセル座標 (px, py) を Leaflet CRS.Simple 座標に変換。
    ・X軸: png左端=0, 右端=BASE_W
    ・Y軸反転: png上端=BASE_H, 下端=0  (Leafletのlatは下が小さい)
    """
    sx = px * BASE_W / img_w
    sy = py * BASE_H / img_h
    return {"lat": round(BASE_H - sy, 1), "lng": round(sx, 1)}


# ── カラーマスク定義 ──────────────────────────────────────────────────────────
def mask_red(arr: np.ndarray) -> np.ndarray:
    """首都マーカー: 暗めの赤（#8B0000〜#CC2222）"""
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    return (r.astype(int) > 120) & (g.astype(int) < 80) & (b.astype(int) < 80)


def mask_blue(arr: np.ndarray) -> np.ndarray:
    """都市マーカー: 青（#0000CC〜#3B82F6）"""
    r, g, b = arr[:, :, 0].astype(int), arr[:, :, 1].astype(int), arr[:, :, 2].astype(int)
    return (b > 120) & (r < 110) & (b > r + 30) & (b > g + 20)


def mask_orange(arr: np.ndarray) -> np.ndarray:
    """高速道路: オレンジ（#FF6600〜#FF9900）"""
    r, g, b = arr[:, :, 0].astype(int), arr[:, :, 1].astype(int), arr[:, :, 2].astype(int)
    return (r > 180) & (g > 60) & (g < 190) & (b < 80) & (r > g + 50)


def mask_dark(arr: np.ndarray) -> np.ndarray:
    """暗い線（高速鉄道・幹線鉄道）: ほぼ黒に近い暗色"""
    r, g, b = arr[:, :, 0].astype(int), arr[:, :, 1].astype(int), arr[:, :, 2].astype(int)
    brightness = r + g + b
    # 暗い（合計<300）かつオレンジ・赤・マゼンタでない
    not_orange  = ~((r > 180) & (g > 60) & (b < 80))
    not_magenta = ~((r > 150) & (b > 150) & (g < 100))
    not_red     = ~((r > 150) & (g < 80) & (b < 80))
    return (brightness < 350) & not_orange & not_magenta & not_red


def mask_magenta(arr: np.ndarray) -> np.ndarray:
    """州境: マゼンタ/ピンク（#FF00FF〜#FF66FF）"""
    r, g, b = arr[:, :, 0].astype(int), arr[:, :, 1].astype(int), arr[:, :, 2].astype(int)
    return (r > 150) & (b > 150) & (g < 100) & (r > g + 80) & (b > g + 80)


# ── 都市抽出 ──────────────────────────────────────────────────────────────────
def extract_cities(img_path: Path) -> list[dict]:
    """
    cities.png から首都（赤■）と都市（青●）の重心座標を抽出。
    青のコンポーネントサイズ大 → major（100万人以上）, 小 → city。
    """
    img = Image.open(img_path).convert("RGB")
    arr = np.array(img)
    h, w = arr.shape[:2]
    cities = []

    # 首都（赤）
    red_mask = mask_red(arr)
    labeled, n = ndimage.label(red_mask)
    for i in range(1, n + 1):
        comp = labeled == i
        if comp.sum() < 8:
            continue
        ys, xs = np.where(comp)
        coord = to_leaflet(float(xs.mean()), float(ys.mean()), w, h)
        cities.append({"type": "capital", **coord})
    print(f"  首都: {sum(1 for c in cities if c['type']=='capital')} 件")

    # 都市（青）
    blue_mask = mask_blue(arr)
    labeled, n = ndimage.label(blue_mask)
    for i in range(1, n + 1):
        comp = labeled == i
        size = int(comp.sum())
        if size < 6:
            continue
        ys, xs = np.where(comp)
        coord = to_leaflet(float(xs.mean()), float(ys.mean()), w, h)
        # 面積の大小で major / city を判定（閾値は画像を見て調整可）
        city_type = "major" if size >= 50 else "city"
        cities.append({"type": city_type, **coord})

    n_major = sum(1 for c in cities if c["type"] == "major")
    n_city  = sum(1 for c in cities if c["type"] == "city")
    print(f"  大都市(major): {n_major} 件")
    print(f"  都市(city):    {n_city} 件")
    return cities


# ── ライン抽出 ────────────────────────────────────────────────────────────────
def _dfs_trace(pixel_set: set, start: tuple) -> list[tuple]:
    """
    DFSでスケルトンピクセルを8近傍で辿り、順序付きリストを返す。
    分岐点では最初に見つかったパスのみ辿る（単純化）。
    """
    visited = set()
    path = []

    def dfs(x, y):
        if (x, y) in visited:
            return
        visited.add((x, y))
        path.append((x, y))
        # 8近傍を距離順に探索
        for dx, dy in [(0,1),(1,0),(0,-1),(-1,0),(1,1),(1,-1),(-1,1),(-1,-1)]:
            nb = (x + dx, y + dy)
            if nb in pixel_set and nb not in visited:
                dfs(nb[0], nb[1])

    sys.setrecursionlimit(500_000)
    dfs(*start)
    return path


def _find_endpoint(pixel_set: set, xs: np.ndarray, ys: np.ndarray) -> tuple:
    """コンポーネントの端点（隣接数が最小のピクセル）を探す。"""
    # まず最上端のピクセルを候補に
    min_idx = ys.argmin()
    candidates = list(zip(xs[ys == ys[min_idx]].tolist(), [int(ys[min_idx])] * (ys == ys[min_idx]).sum()))
    for cx, cy in candidates:
        nbcount = sum(1 for dx in [-1,0,1] for dy in [-1,0,1]
                      if (dx, dy) != (0, 0) and (cx+dx, cy+dy) in pixel_set)
        if nbcount <= 1:
            return (cx, cy)
    return (int(xs[min_idx]), int(ys[min_idx]))


def extract_lines(
    img_path: Path,
    color_mask_fn,
    road_type: str,
    step: int = 10,
    min_pixels: int = 30,
    max_components: int = 100,
) -> list[dict]:
    """
    ラインレイヤー画像から色フィルタ → スケルトン化 → 連結成分 → 順序付き座標列 を抽出。

    Args:
        step: ダウンサンプリング間隔（大きいほどポイント数が減る）
        min_pixels: この画素数未満のコンポーネントは無視（ノイズ除去）
        max_components: 取り出す最大ライン数
    """
    img = Image.open(img_path).convert("RGB")
    arr = np.array(img)
    h, w = arr.shape[:2]

    mask = color_mask_fn(arr)
    print(f"  マスクピクセル数: {mask.sum():,}")

    # スケルトン化（1px幅に細線化）
    skel = skeletonize(mask)
    print(f"  スケルトンピクセル数: {skel.sum():,}")

    # 連結成分
    labeled, n_total = ndimage.label(skel, structure=np.ones((3, 3)))
    print(f"  連結成分数: {n_total}")

    # サイズ順に並べて上位を処理
    sizes = [(i, int((labeled == i).sum())) for i in range(1, n_total + 1)]
    sizes.sort(key=lambda x: -x[1])

    lines = []
    for comp_idx, (i, size) in enumerate(sizes[:max_components]):
        if size < min_pixels:
            break  # 残りはすべて小さいのでスキップ

        comp_mask = labeled == i
        ys, xs = np.where(comp_mask)
        pixel_set = set(zip(xs.tolist(), ys.tolist()))

        start = _find_endpoint(pixel_set, xs, ys)
        path = _dfs_trace(pixel_set, start)

        # ダウンサンプリング（先頭・末尾は必ず残す）
        if len(path) > 2:
            sampled = [path[0]] + path[1:-1:step] + [path[-1]]
        else:
            sampled = path

        if len(sampled) < 2:
            continue

        points = [to_leaflet(float(px), float(py), w, h) for px, py in sampled]
        lines.append({
            "name": f"{road_type}_{comp_idx + 1}",
            "type": road_type,
            "points": points,
        })
        print(f"  [{comp_idx+1}] {road_type}_{comp_idx+1}: {len(points)} ポイント")

    return lines


# ── メイン ────────────────────────────────────────────────────────────────────
def main():
    print("=" * 50)
    print("NGP 座標抽出スクリプト")
    print("=" * 50)

    # ── 都市 ──────────────────────────────────────────────
    cities_img = MAPS_DIR / "cities.png"
    print(f"\n📍 都市を抽出中: {cities_img}")
    cities = extract_cities(cities_img)

    out_cities = OUT_DIR / "extracted_cities.json"
    out_cities.write_text(json.dumps(cities, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  → {out_cities} に保存 ({len(cities)} 件)")

    # ── 道路・鉄道・州境 ───────────────────────────────────
    line_configs = [
        {
            "img":   MAPS_DIR / "highway.png",
            "mask":  mask_orange,
            "type":  "highway",
            "step":  10,   # ポイント間隔（小さいほど詳細）
            "min":   40,
        },
        {
            "img":   MAPS_DIR / "highspeed_rail.png",
            "mask":  mask_dark,
            "type":  "highspeed_rail",
            "step":  8,
            "min":   30,
        },
        {
            "img":   MAPS_DIR / "railway.png",
            "mask":  mask_dark,
            "type":  "railway",
            "step":  10,
            "min":   40,
        },
        {
            "img":   MAPS_DIR / "border.png",
            "mask":  mask_magenta,
            "type":  "border",
            "step":  12,
            "min":   30,
        },
    ]

    all_roads = []
    for cfg in line_configs:
        print(f"\n🛣️  {cfg['type']} を抽出中: {cfg['img'].name}")
        lines = extract_lines(
            cfg["img"],
            cfg["mask"],
            cfg["type"],
            step=cfg["step"],
            min_pixels=cfg["min"],
        )
        all_roads.extend(lines)
        print(f"  → {len(lines)} 本のラインを抽出")

    out_roads = OUT_DIR / "extracted_roads.json"
    out_roads.write_text(json.dumps(all_roads, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n→ {out_roads} に保存 (合計 {len(all_roads)} 本)")

    print("\n✅ 抽出完了！")
    print(f"  次のステップ: node --env-file=.env scripts/uploadExtracted.mjs")


if __name__ == "__main__":
    main()
