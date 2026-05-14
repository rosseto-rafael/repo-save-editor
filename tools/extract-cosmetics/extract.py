"""Full R.E.P.O cosmetics extractor.

Uses UnityPy + TypeTreeGenerator (loads `Assembly-CSharp.dll` via pythonnet)
to build typetrees for the game's custom ScriptableObjects (CosmeticAsset,
CosmeticTypeAsset, CosmeticCategoryAsset, MetaManager) that plain UnityPy
normally cannot deserialize.

Flow:
  1. Resolve MetaManager MonoScript pathID in globalgamemanagers.assets.
  2. Find the single MetaManager instance (in level0) and read its typetree.
  3. The `cosmeticAssets` property defines save id order:
        cosmeticAssets[0] is cosmetic id 0, [1] is id 1, etc.
  4. Resolve each PPtr -> CosmeticAsset; read m_Name/assetName/type/rarity.
  5. Map int `type` to string `typeName` from cosmeticTypeAssets.
  6. Map category -> typeList from CosmeticCategoryAssets.
  7. Also extract types from TSV (`cosmetic-types.json`) and Localizations
     (`Menu.tsv`) for official display strings.

Outputs under `public/`:
  - cosmetics.json: `[{ id, name, assetName, type, rarity, category, ... }, ...]`
  - cosmetic-types.json: categorized type strings (from TSV)

Usage:
    python tools/extract-cosmetics/extract.py [--game-dir PATH] [--out-dir PATH]
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys

import UnityPy
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator

DEFAULT_GAME_DIR = r"C:\Program Files (x86)\Steam\steamapps\common\REPO"
DEFAULT_OUT_DIR = "public"

MENU_TSV_REL = "REPO_Data/StreamingAssets/Localizations/Default/Menu.tsv"
TYPE_KEY_PREFIXES = ("COSMETICS.TYPE.", "COSMETICS.CATEGORY.")

RARITY_NAMES = {
    0: "Common",
    1: "Uncommon",
    2: "Rare",
    3: "Epic",
}


def parse_menu_tsv(game_dir: str) -> list[dict]:
    path = os.path.join(game_dir, MENU_TSV_REL)
    if not os.path.isfile(path):
        print(f"[extract] WARN: localization file not found at {path}", file=sys.stderr)
        return []
    entries: list[dict] = []
    with open(path, encoding="utf-8") as f:
        reader = csv.reader(f, delimiter="\t")
        for row in reader:
            if len(row) < 2:
                continue
            key, value = row[0].strip(), row[1].strip()
            if not key.startswith(TYPE_KEY_PREFIXES):
                continue
            entries.append({"key": key, "name": value})
    entries.sort(key=lambda e: (0 if e["key"].startswith("COSMETICS.TYPE.") else 1, e["key"]))
    return entries


def get_unity_version(env) -> str:
    try:
        return env.file.unity_version
    except Exception:
        for f in env.files.values():
            if hasattr(f, "unity_version"):
                return f.unity_version
    return "2022.3.67f2"


def find_monoscript_pid(env, class_name: str) -> int | None:
    for obj in env.objects:
        if obj.type.name != "MonoScript":
            continue
        try:
            ms = obj.read()
        except Exception:
            continue
        if getattr(ms, "m_ClassName", "") == class_name:
            return obj.path_id
    return None


def is_external_to_file(obj, fid: int, target_filename: str) -> bool:
    """True if m_Script PPtr (fid) points at a file whose name matches."""
    if fid == 0:
        return obj.assets_file.name.lower().endswith(target_filename.lower())
    container = obj.assets_file
    if fid - 1 >= len(container.externals):
        return False
    return container.externals[fid - 1].path.lower().endswith(target_filename.lower())


def index_file_by_path_id(env) -> dict[str, dict[int, object]]:
    """Per asset file, map path_id -> ObjectReader. Path ids collide across
    files, so we index by file name."""
    idx: dict[str, dict[int, object]] = {}
    for fp, f in env.files.items():
        if not hasattr(f, "objects"):
            continue
        objs = f.objects.values() if isinstance(f.objects, dict) else f.objects
        per_file: dict[int, object] = {}
        for o in objs:
            if hasattr(o, "path_id"):
                per_file[o.path_id] = o
        idx[fp] = per_file
    return idx


def resolve_pptr(env, by_file, owner_obj, ptr) -> object | None:
    """Resolve a PPtr from the owner. m_FileID indexes into the owner's externals."""
    pid = ptr.get("m_PathID", 0)
    fid = ptr.get("m_FileID", 0)
    if pid == 0:
        return None
    if fid == 0:
        # same asset file as owner
        per_file = next(
            (v for k, v in by_file.items() if k == owner_obj.assets_file.name or k.endswith(owner_obj.assets_file.name)),
            None,
        )
        if per_file is None:
            # fallback: global path_id search
            for v in by_file.values():
                if pid in v:
                    return v[pid]
            return None
        return per_file.get(pid)
    container = owner_obj.assets_file
    if fid - 1 >= len(container.externals):
        return None
    ext_path = container.externals[fid - 1].path
    ext_basename = os.path.basename(ext_path)
    # try file whose path ends with external basename
    for fp, per_file in by_file.items():
        if fp.endswith(ext_basename) or os.path.basename(fp) == ext_basename:
            if pid in per_file:
                return per_file[pid]
    # fallback
    for v in by_file.values():
        if pid in v:
            return v[pid]
    return None


def read_cosmetic_assets(env, by_file, mm_obj, mm_data: dict, nodes_ca) -> dict[int, dict]:
    """Return mapping id -> full CosmeticAsset dict."""
    cosmetic_ptrs = mm_data.get("cosmeticAssets") or []
    out: dict[int, dict] = {}
    for idx, ptr in enumerate(cosmetic_ptrs):
        obj = resolve_pptr(env, by_file, mm_obj, ptr)
        if obj is None:
            print(f"  WARN: id={idx} pathID={ptr.get('m_PathID')} fid={ptr.get('m_FileID')} not resolved", file=sys.stderr)
            continue
        try:
            data = obj.read_typetree(nodes=nodes_ca)
        except Exception as e:
            print(f"  WARN: id={idx} pathID={obj.path_id} container={obj.assets_file.name} read failed: {e}", file=sys.stderr)
            continue
        out[idx] = data
    return out


def read_type_assets(env, by_file, mm_obj, mm_data: dict, nodes_cta) -> dict[int, dict]:
    """type (int) -> CosmeticTypeAsset data."""
    out: dict[int, dict] = {}
    for ptr in mm_data.get("cosmeticTypeAssets") or []:
        obj = resolve_pptr(env, by_file, mm_obj, ptr)
        if obj is None:
            continue
        try:
            data = obj.read_typetree(nodes=nodes_cta)
        except Exception:
            continue
        type_int = data.get("type")
        if type_int is None:
            continue
        out[type_int] = data
    return out


def read_category_assets(env, by_file, mm_obj, mm_data: dict, nodes_ccat) -> list[dict]:
    """Category list (Head/Arms/Body/Legs/...) with typeList holding
    the `type` ints belonging to each category."""
    out: list[dict] = []
    for ptr in mm_data.get("CosmeticCategoryAssets") or []:
        obj = resolve_pptr(env, by_file, mm_obj, ptr)
        if obj is None:
            continue
        try:
            data = obj.read_typetree(nodes=nodes_ccat)
        except Exception:
            continue
        out.append(data)
    return out


def build_cosmetics_json(
    cosmetics: dict[int, dict],
    types: dict[int, dict],
    categories: list[dict],
) -> list[dict]:
    """Merge the three sources into a flat list for the web app."""
    # type int -> category name
    type_to_category: dict[int, str] = {}
    for cat in categories:
        cat_name = cat.get("m_Name", "") or cat.get("categoryName", "")
        cat_label = cat.get("categoryName", "") or cat_name
        for t in cat.get("typeList") or []:
            type_to_category[t] = cat_label

    items: list[dict] = []
    for cid, data in sorted(cosmetics.items()):
        type_int = data.get("type", -1)
        type_meta = types.get(type_int, {})
        type_name = type_meta.get("typeName") or type_meta.get("m_Name") or f"Type {type_int}"
        rarity_int = data.get("rarity", -1)
        # Display name: prefer assetName (short), fallback to m_Name
        asset_name = (data.get("assetName") or "").strip()
        m_name = (data.get("m_Name") or "").strip()
        name = asset_name or m_name
        items.append({
            "id": cid,
            "name": name,
            "assetName": asset_name,
            "fullName": m_name,
            "type": type_name,
            "typeInt": type_int,
            "rarity": rarity_int,
            "rarityName": RARITY_NAMES.get(rarity_int, "Unknown"),
            "category": type_to_category.get(type_int, ""),
            "tintable": bool(data.get("tintable", 0)),
        })
    return items


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--game-dir",
        default=os.environ.get("REPO_GAME_DIR", DEFAULT_GAME_DIR),
        help=f"REPO install folder (default: {DEFAULT_GAME_DIR}).",
    )
    parser.add_argument(
        "--out-dir",
        default=DEFAULT_OUT_DIR,
        help=f"Output directory (default: {DEFAULT_OUT_DIR}).",
    )
    args = parser.parse_args()

    out_dir = args.out_dir
    os.makedirs(out_dir, exist_ok=True)

    # Localizations -> type catalog (cosmetic-types.json) ----------------
    types_payload = parse_menu_tsv(args.game_dir)
    types_path = os.path.join(out_dir, "cosmetic-types.json")
    with open(types_path, "w", encoding="utf-8") as f:
        json.dump(types_payload, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"[extract] wrote {types_path} ({len(types_payload)} type strings)")

    # Load Unity assets ----------------------------------------------
    data_dir = os.path.join(args.game_dir, "REPO_Data")
    if not os.path.isdir(data_dir):
        print(f"[extract] ERROR: REPO_Data not found at {data_dir}", file=sys.stderr)
        return 1

    gg_path = os.path.join(data_dir, "globalgamemanagers.assets")
    if not os.path.isfile(gg_path):
        print(f"[extract] ERROR: {gg_path} not found", file=sys.stderr)
        return 1

    print("[extract] resolving MetaManager MonoScript pathID ...")
    env_gg = UnityPy.load(gg_path)
    unity_version = get_unity_version(env_gg)
    print(f"[extract] Unity {unity_version}")
    mm_script_pid = find_monoscript_pid(env_gg, "MetaManager")
    if mm_script_pid is None:
        print("[extract] ERROR: MetaManager MonoScript not found", file=sys.stderr)
        return 1
    print(f"[extract] MetaManager MonoScript pathID = {mm_script_pid}")

    print("[extract] generating typetrees via Assembly-CSharp.dll ...")
    gen = TypeTreeGenerator(unity_version=unity_version)
    gen.load_local_game(args.game_dir)
    nodes_mm = gen.get_nodes_up("Assembly-CSharp", "MetaManager")
    nodes_ca = gen.get_nodes_up("Assembly-CSharp", "CosmeticAsset")
    nodes_cta = gen.get_nodes_up("Assembly-CSharp", "CosmeticTypeAsset")
    nodes_ccat = gen.get_nodes_up("Assembly-CSharp", "CosmeticCategoryAsset")

    print("[extract] loading full REPO_Data (may take a while) ...")
    env = UnityPy.load(data_dir)
    print(f"[extract] {len(env.objects)} objects, {len(env.files)} files")

    print("[extract] locating MetaManager ...")
    mm_obj = None
    for obj in env.objects:
        if obj.type.name != "MonoBehaviour":
            continue
        try:
            head = obj.parse_monobehaviour_head()
        except Exception:
            continue
        sp = head.m_Script
        if sp.m_PathID != mm_script_pid:
            continue
        if not is_external_to_file(obj, sp.m_FileID, "globalgamemanagers.assets"):
            continue
        mm_obj = obj
        break
    if mm_obj is None:
        print("[extract] ERROR: MetaManager instance not found", file=sys.stderr)
        return 1

    print(f"[extract] MetaManager in {mm_obj.assets_file.name!r} (pathID={mm_obj.path_id})")
    mm_data = mm_obj.read_typetree(nodes=nodes_mm)
    print(
        f"[extract] cosmeticAssets={len(mm_data.get('cosmeticAssets') or [])} "
        f"cosmeticTypeAssets={len(mm_data.get('cosmeticTypeAssets') or [])} "
        f"CosmeticCategoryAssets={len(mm_data.get('CosmeticCategoryAssets') or [])}"
    )

    by_file = index_file_by_path_id(env)
    cosmetics_data = read_cosmetic_assets(env, by_file, mm_obj, mm_data, nodes_ca)
    types_data = read_type_assets(env, by_file, mm_obj, mm_data, nodes_cta)
    categories_data = read_category_assets(env, by_file, mm_obj, mm_data, nodes_ccat)

    items = build_cosmetics_json(cosmetics_data, types_data, categories_data)

    cosmetics_path = os.path.join(out_dir, "cosmetics.json")
    with open(cosmetics_path, "w", encoding="utf-8") as f:
        json.dump(items, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"[extract] wrote {cosmetics_path} ({len(items)} cosmetics)")

    # Also write detailed type catalog (TSV cosmetic-types.json unchanged;
    # this adds a "rich" map of int types to typeName and categories).
    type_catalog: list[dict] = []
    type_to_cat: dict[int, str] = {}
    for cat in categories_data:
        cat_label = cat.get("categoryName") or cat.get("m_Name", "")
        for t in cat.get("typeList") or []:
            type_to_cat[t] = cat_label
    for t_int, t_data in sorted(types_data.items()):
        type_catalog.append({
            "type": t_int,
            "name": t_data.get("typeName") or t_data.get("m_Name", ""),
            "category": type_to_cat.get(t_int, ""),
            "canEquipMultiple": bool(t_data.get("canEquipMultiple", 0)),
        })
    ttypes_path = os.path.join(out_dir, "cosmetic-type-catalog.json")
    with open(ttypes_path, "w", encoding="utf-8") as f:
        json.dump(type_catalog, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"[extract] wrote {ttypes_path} ({len(type_catalog)} types)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
