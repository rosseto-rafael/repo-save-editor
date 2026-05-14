# REPO Cosmetics Save Editor

Web editor for the **R.E.P.O** (Semiwork) `MetaSave.es3` file. It focuses
exclusively on **cosmetics** and nothing else. Static React/Vite SPA
that runs entirely in the user's browser; the save never leaves the machine.

**URL:** [repo-save-editor.web.app](https://repo-save-editor.web.app)

## How to use

1. Find your save: `%USERPROFILE%\AppData\LocalLow\semiwork\Repo\MetaSave.es3`.
2. **Back up the file** (keep a safe copy). The game silently rejects
   malformed files.
3. Open the app, drop the save, make your edits.
4. Click **Download MetaSave.es3** and replace the file in the folder above.

## Features

- Drop or pick `MetaSave.es3`, decrypted in-browser via the Web Crypto API
  (AES-128-CBC + PBKDF2 SHA-1, same crypto as Easy Save 3).
- **Full catalog of all 547 in-game cosmetics** (id, name, type,
  category, rarity, tintable) extracted with UnityPy + typetree from
  `Assembly-CSharp.dll`.
- Cosmetics grid with:
  - distinct colors for unlocked vs locked;
  - rarity frame (Common / Uncommon / Rare / Epic);
  - crown on equipped items;
  - search by id / name / type / category;
  - filter by category (`Head` / `Body` / `Arms` / `Legs`) and by type
    (click to filter; double-click unlocks everything in that category/type);
  - bulk actions: unlock all known, lock all (keeps equipped);
  - unlock by inclusive id range and manual id entry.
- Download re-encrypted `MetaSave.es3`, ready to put back in the game folder.

## Stack

- **Vite 6 + React 19 + TypeScript** — static SPA.
- **Tailwind 4** — styles via `@theme` in CSS, no `tailwind.config`.
- **Web Crypto API** — PBKDF2 + AES-CBC with no Node dependency.
- **DecompressionStream / CompressionStream** — native gzip.
- **Python + UnityPy + TypeTreeGenerator (pythonnet)** — helper script to
  extract `MetaManager.cosmeticAssets` and full `CosmeticAsset` ScriptableObjects
  (see `tools/extract-cosmetics/`).

## Development

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # outputs dist/
npm run preview   # serves dist/ at http://localhost:4173
npm run lint
npm run typecheck
```

### Crypto verification

`scripts/verify-crypto.mjs` reproduces the app algorithm in Node 22+ and
round-trips against the real `MetaSave.es3` in the workspace:

```bash
node scripts/verify-crypto.mjs
```

Expected output (test save in repo, everything unlocked):

```
decrypted length: 23262
cosmeticUnlocks count: 601
cosmeticHistory count: 601
cosmeticEquipped: 2, 1
round-trip ok
```

## Metadata extraction

`public/cosmetics.json` is already committed (547 cosmetics). To re-extract
(after a game update, for example):

```bash
python -m venv .venv
.venv\Scripts\activate           # Windows; on Linux/macOS use source .venv/bin/activate
pip install -r tools/extract-cosmetics/requirements.txt
python tools/extract-cosmetics/extract.py
```

The script:

1. Locates the `MetaManager` class `MonoScript` in `globalgamemanagers.assets`
   and its single instance in `level0`.
2. Loads `Assembly-CSharp.dll` via `pythonnet` and generates typetrees for
   custom ScriptableObjects (`MetaManager`, `CosmeticAsset`,
   `CosmeticTypeAsset`, `CosmeticCategoryAsset`).
3. Reads the `MetaManager.cosmeticAssets` array — the **array index is the id
   stored in the save**.
4. Resolves each PPtr, reads `CosmeticAsset` fields (`m_Name`, `assetName`,
   `type`, `rarity`, `tintable`) and joins type/category names from
   `cosmeticTypeAssets` + `CosmeticCategoryAssets`.

Outputs in `public/`:

- `cosmetics.json` — 547 entries `{ id, name, type, category, rarity, ... }`.
- `cosmetic-type-catalog.json` — 33 types with int `type`, `name`,
  `category`, `canEquipMultiple`.
- `cosmetic-types.json` — localized keys from `Menu.tsv` (future i18n).

Details in [tools/extract-cosmetics/README.md](tools/extract-cosmetics/README.md).

## Docker

Two-stage build/runtime (Node 22 alpine → nginx alpine):

```bash
docker compose up --build
```

App at `http://localhost:8000`. To stop:

```bash
docker compose down
```

## Save format

After decryption, JSON looks like:

```jsonc
{
  "cosmeticTokens":   { "__type": "...List`1[Int32]...", "value": [/* ids */] },
  "cosmeticUnlocks":  { "__type": "...List`1[Int32]...", "value": [/* ids */] },
  "cosmeticHistory":  { "__type": "...List`1[Int32]...", "value": [/* ids */] },
  "cosmeticEquipped": { "__type": "...List`1[Int32]...", "value": [/* ids */] },
  "cosmeticPresets":  { "__type": "...List<List<Int32>>...", "value": [[]] },
  "colorPresets":     { "__type": "...List<List<Int32>>...", "value": [[]] },
  "colorsEquipped":   { "__type": "System.Int32[],mscorlib",   "value": [/* ints */] }
}
```

The editor only changes `cosmeticUnlocks` and `cosmeticHistory`; other fields
are preserved byte-for-byte on round-trip for compatibility.

## Credits

- [N0edL/R.E.P.O-Save-Editor](https://github.com/N0edL/R.E.P.O-Save-Editor)
  — crypto key and PBKDF2/AES-CBC algorithm.
- [luccasfr/repo-save-editor](https://github.com/luccasfr/repo-save-editor)
  — basis for the project.

## License

MIT.
