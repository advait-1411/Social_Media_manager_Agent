# Asset & Post Flow Analysis

Reference notes aligned with the current codebase (create flow, assets, image generation, analytics, and global bulk jobs).

## 1. Create Page (`frontend/app/create/page.tsx`)

### Layout
- **Left:** Composer (channels, caption, media, actions).
- **Right:** Live previews (large breakpoints).
- **Modals:** Asset Closet, Schedule, Image Editor.

### Notable state
- `selectedChannels`, `caption`, `media`, `additionalMedia`, `postType`, `previewSlideIndex`, `closetPickerMode`, `brandKits`, `selectedBrandKit`, etc.
- **Bulk AI mode:** `createMode` toggles manual vs bulk; long-running `generateBulkVariations` is intended to run under **`BulkJobProvider`** so navigation does not cancel the request.

### Root providers (`frontend/app/layout.tsx`)
- **`SocketProvider`** wraps the app for real-time events.
- **`BulkJobProvider`** (`frontend/contexts/bulk-job-context.tsx`) wraps **`LayoutShell`** so bulk generation state and toasts survive route changes.

### Flows
- **Post now:** Typically `POST /api/posts/create-and-publish` with `media_assets` (primary + carousel IDs), `platform_settings` / post type, channels.
- **Draft:** `POST /api/posts/` with `status` draft.
- **Schedule:** Create post then `POST /api/posts/{id}/schedule` with `scheduled_time`.

---

## 2. Asset Closet
- Tabs: assets, drafts, campaigns, brand kits (kit grid → kit-scoped asset gallery).
- **Carousel:** `closetPickerMode` selects primary vs additional slides; `additionalMedia` holds slides 2…N.

---

## 3. AI caption
- **`aiApi.generateCaption`** (see `frontend/lib/api.ts`) with prompt, platform, tone — replaces caption state on success.

---

## 4. Posts backend (`backend/app/routers/posts.py`)
Key behaviors (verify exact names in file):
- **`POST /api/posts/`** — create `Post` rows.
- **`POST /api/posts/create-and-publish`** — create then publish via shared publish pipeline (Composio-first where configured).
- **`POST /api/posts/{id}/schedule`**, **`POST /api/posts/{id}/publish`** — schedule / manual publish.
- **Bulk:** `POST /api/posts/generate-bulk-variations`, `POST /api/posts/batch-create` — creates assets + posts; may emit socket events for UI refresh.

**Storage:** `media_assets` JSON array of asset IDs; `platform_settings` JSON for per-platform options.

---

## 5. Image generation (`backend/app/services/image_gen.py`)

### `generate_images_service(prompt, user_prompt="", count=1, model="google/gemini-3-pro-image-preview", logo_path=None)`

- Calls **OpenRouter** `https://openrouter.ai/api/v1/chat/completions`.
- **Prompt prefix:** If the prompt does not start with `"generate an image"`, it is wrapped for clearer image-model behavior.
- **Model fallback loop:** Tries `model`, then a deduplicated list including e.g. `google/gemini-3-pro-image-preview`, `google/gemini-3.1-flash-image-preview`, `openai/gpt-5-image-mini`, `google/gemini-2.5-flash-image` until one returns image bytes.
- **Without `OPENROUTER_API_KEY`:** Writes **mock** JPEGs to `generated_images/` so local dev does not crash.
- **Overlay:** If `logo_path` exists on disk, overlays that **Brand Kit** logo; caption overlay uses **`get_image_overlay_plan(user_prompt)`** defaults or AI plan.
- **Output:** Relative paths like `generated_images/<filename>` returned to callers.

### Assets router integration (`backend/app/routers/assets.py`)
- **`POST /api/assets/generate`:** Resolves **Brand Kit** via `_resolve_kit` (explicit `brand_kit_id` **or** the single row with **`is_default=True`**). `system_prompt_to_use = kit.system_prompt if kit else None`; `build_remix_prompt(user_prompt, system_prompt_to_use)`; passes **`logo_path=kit.logo_light_path`** when kit exists. **`POST /api/brand-kits`** creates kits with **`is_default=False`** — there is no public toggle in the router to mark default; use DB updates if you need a default kit for `_resolve_kit(None, …)`.
- **`meta_data`:** `source: "generated"`, `model`, etc.
- **Default model** on the request body: `google/gemini-3-pro-image-preview` (check `GenerateRequest` in `assets.py` for the current default).

### `build_remix_prompt` (`backend/app/services/prompt_builder.py`)
- Combines optional **brand constraints** (`system_prompt` string from the kit) with the user **scene** text.
- Empty user prompt gets a generic ONIDA-style scene sentence (hardcoded in that branch) plus brand suffix if any — **not** a separate exported `ONIDA_SYSTEM_PROMPT` constant in this file anymore (docstring still mentions legacy naming).

---

## 6. Static hosting
- **`main.py`** mounts **`/generated_images`** → `generated_images/` and **`/brand_kit_logos`** → `brand_kit_logos/`.
- Assets store **`file_path`** (relative or absolute paths used by remix/open).

---

## 7. Analytics (`frontend/app/analytics/page.tsx`)
- Loads **`analyticsApi.getPosts()`** → `GET /api/posts/` and **`analyticsApi.getAssets()`** → `GET /api/assets/`.
- **Temporal filter:** `date-fns` `subDays` / `isAfter` on `created_at`.
- **Asset utilization:** Counts **`meta_data.source === 'generated'`** vs **`'upload'`** (uploads set `source: "upload"` in `upload_asset`). Remix assets use **`source: "remix"`** and are excluded from those two buckets unless you extend the UI.

---

## 8. Campaigns (`frontend/app/campaigns/page.tsx` + `backend/app/routers/campaigns.py`)
- AI returns structured **campaign blueprints** (JSON files under `backend/campaigns/`).
- **Commit** promotes selected cards to real **`Post`** rows (`draft`).
- **Brand kit** context can be injected into generation per app logic; image auto-generation on commit is **not** automatic (see `Features.md`).

---

## 9. Database & migrations
- **`main.py`:** `Base.metadata.create_all` and a small migration block adding **`assets.brand_kit_id`** if missing.
- **Posts** include optional approval columns (`approved_at`, `rejected_at`, etc.) on the model; **Approvals** UI may still use mock data until wired.

---

*This file is a developer-oriented snapshot; prefer reading `README.md` and `Features.md` for product-level documentation.*
