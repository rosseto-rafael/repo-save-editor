# Cosmetics Metadata Extractor

Python script that reads R.E.P.O game files and writes the JSON metadata consumed
by the web app. Resolves **all 547 in-game cosmetics** with `id`,
`name`, `type`, `category`, `rarity`, and `tintable`.

## How it works

The extractor uses UnityPy's `TypeTreeGenerator` (loads
`REPO_Data/Managed/Assembly-CSharp.dll` via pythonnet) to build typetrees for
custom `ScriptableObject` types — something plain UnityPy cannot do because
assets do not carry full typetree info.

Flow:

1. Locates the `MetaManager` class `MonoScript` in `REPO_Data/globalgamemanagers.assets`.
2. Finds the single `MetaManager` instance (in `level0`).
3. Reads the serialized `cosmeticAssets` array — **array order is the save id**:
   `cosmeticAssets[0]` is cosmetic id `0`, `[1]` is id `1`, and so on.
4. Resolves each `PPtr<CosmeticAsset>` and reads the full ScriptableObject:
   `m_Name`, `assetName`, `type` (int), `rarity` (int), `tintable`,
   `customTypeList`, etc.
5. Does the same for all 33 `CosmeticTypeAsset` entries (map `type int` → `typeName`)
   and the 4 `CosmeticCategoryAsset` entries (category `Head`/`Body`/`Arms`/`Legs`).
6. Also extracts localized types from
   `REPO_Data/StreamingAssets/Localizations/Default/Menu.tsv`.

## Outputs

Everything is written to the repo root `public/` folder:

- `cosmetics.json` — full list of 547 cosmetics, each with
  `id`, `name`, `assetName`, `fullName`, `type`, `typeInt`, `rarity`,
  `rarityName`, `category`, and `tintable`.
- `cosmetic-type-catalog.json` — all 33 game types with int `type`,
  `name`, `category`, and `canEquipMultiple`. From `CosmeticTypeAsset`.
- `cosmetic-types.json` — localized keys (`COSMETICS.TYPE.*` and
  `COSMETICS.CATEGORY.*`) from Menu.tsv. Useful for other languages later.

## Prerequisites

- Python 3.10+
- R.E.P.O installed (default: `C:\Program Files (x86)\Steam\steamapps\common\REPO`)
- `pythonnet` (Windows / .NET runtime) — required for `TypeTreeGenerator` to load
  `Assembly-CSharp.dll`.

```bash
python -m venv .venv
.venv\Scripts\activate           # Windows
pip install -r tools/extract-cosmetics/requirements.txt
```

## Usage

From the repo root:

```bash
python tools/extract-cosmetics/extract.py
```

Arguments:

| Flag | Default | Description |
| --- | --- | --- |
| `--game-dir PATH` | `C:\Program Files (x86)\Steam\steamapps\common\REPO` | Game install folder. Also accepts `REPO_GAME_DIR` in the environment. |
| `--out-dir PATH` | `public` | Directory where JSON files are written. |

## When to re-run

- After a game update (new cosmetics or type changes).
  The extractor is idempotent — running again overwrites the JSONs.

## Technical notes

- The 547 total comes directly from `cosmeticAssets.size` on `MetaManager`.
  Saves with ids above 546 (e.g. editors using range 0..600) may contain
  "ghost ids" the game ignores.
- `CosmeticAsset` path ids in `sharedassets0.assets` are **not** contiguous in
  save-id order — the `cosmeticAssets` array on `MetaManager` is the source of truth.
- The extractor does not rely on `Resources.Load` at runtime and does not need
  the game running.
