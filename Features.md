# VelvetQueue - Feature Implementation Status

This document tracks which features are **fully implemented**, **partially implemented**, and **not yet implemented** in the VelvetQueue platform.

**Status Legend:**

- ✅ **IMPLEMENTED** - Feature is fully functional with backend integration
- 🟡 **PARTIAL** - Feature exists but has limitations or incomplete functionality
- ❌ **NOT IMPLEMENTED** - Feature is displayed in UI but not functional
- 📝 **MOCK DATA** - Feature displays mock/placeholder data only

---

## 📁 Assets Page (`/assets`)

| Feature | Status | Notes |
| --- | --- | --- |
| AI Image Generation | ✅ **IMPLEMENTED** | OpenRouter with default model `google/gemini-3-pro-image-preview` and **automatic model fallbacks** on failure. Prompts from `build_remix_prompt()` using the resolved **Brand Kit** `system_prompt` (default kit when no `brand_kit_id`). |
| Brand logo overlay | ✅ **IMPLEMENTED** | Overlays **Brand Kit `logo_light_path`** when the file exists; caption placement from AI overlay plan. |
| Asset Upload | ✅ **IMPLEMENTED** | Uploads to `generated_images/`; `meta_data.source` = `upload`; links default kit when present. |
| Asset Grid / Search / Filter | ✅ **IMPLEMENTED** | Filter uses `meta_data.source` (`generated` vs `upload`). |
| Asset Closet Modal | ✅ **IMPLEMENTED** | Selection, search, brand kit tab flow. |
| Asset Management | ✅ **IMPLEMENTED** | Preview, download, delete. |
| Asset Remix (Style with AI) | ✅ **IMPLEMENTED** | `POST /api/assets/{id}/remix` composites product onto AI background; inherits kit; `meta_data.source` = `remix`. |
| Brand Kit Selection | ✅ **IMPLEMENTED** | Dropdown + badges; generation resolves kit for prompts and logo path. |

---

## ✏️ Create Page (`/create`)

| Feature | Status | Notes |
| --- | --- | --- |
| Multi-Platform Selection | ✅ **IMPLEMENTED** | Instagram, LinkedIn, Twitter state. |
| Caption & AI Caption | ✅ **IMPLEMENTED** | AI caption via AI router. |
| Image Editor | ✅ **IMPLEMENTED** | Crop/adjust in modal. |
| Asset Closet & Carousels | ✅ **IMPLEMENTED** | Multi-select for carousels; Brand Kits tab. |
| Post Type (Post / Carousel / Reel) | ✅ **IMPLEMENTED** | Including video → Reel behavior where implemented. |
| Live Previews | ✅ **IMPLEMENTED** | Instagram / LinkedIn / Twitter with carousel navigation. |
| Draft / Schedule / Post Now | ✅ **IMPLEMENTED** | `POST /api/posts/`, schedule, `create-and-publish` with Composio-first publishing where configured. |
| Bulk AI Creation | ✅ **IMPLEMENTED** | `generate-bulk-variations` + `batch-create`; **`BulkJobProvider`** keeps long requests alive across navigation. |
| Real-time status | ✅ **IMPLEMENTED** | Polling + sockets as wired in the app. |

---

## 📅 Publish Page (`/publish`)

| Feature | Status | Notes |
| --- | --- | --- |
| Calendar & List | ✅ **IMPLEMENTED** | Real posts from API. |
| Status polling / toasts | ✅ **IMPLEMENTED** | As implemented in `publish/page.tsx`. |
| Instagram carousels | ✅ **IMPLEMENTED** | Multi `media_assets` → Composio / fallback publishing from post flow. |

---

## 💬 Comments & Interaction

| Feature | Status | Notes |
| --- | --- | --- |
| Sync / sentiment / replies | ✅ **IMPLEMENTED** | Composio MCP with Graph API fallback patterns in services. |
| First comment / settings | ✅ **IMPLEMENTED** | Where exposed in UI and API. |

---

## 📝 Drafts Library

| Feature | Status | Notes |
| --- | --- | --- |
| Draft CRUD & commit | ✅ **IMPLEMENTED** | File-based JSON under `backend/drafts/`; `commit` creates DB posts. |

---

## 📊 Analytics Page (`/analytics`)

| Feature | Status | Notes |
| --- | --- | --- |
| Stats & charts | ✅ **IMPLEMENTED** | Fetches posts + assets; filters by date; **asset source** uses `meta_data.source` (e.g. `generated`, `upload`, `remix`). |
| Date range | ✅ **IMPLEMENTED** | 7d / 30d / All. |

---

## ✅ Approvals Page (`/approvals`)

| Feature | Status | Notes |
| --- | --- | --- |
| Approvals UI | 📝 **MOCK DATA** | `MOCK_APPROVALS` in `frontend/app/approvals/page.tsx`. |
| Approval API | 🟡 **PARTIAL** | Backend `GET /api/approvals/*` and related routes exist; UI not wired to live data. |

---

## ⚙️ Settings Page (`/settings`)

| Feature | Status | Notes |
| --- | --- | --- |
| Channels | 🟡 **PARTIAL** | List from API; deep OAuth often via `.env`. |
| Brand Kits | ✅ **IMPLEMENTED** | CRUD, prompts, light/dark logo uploads via `/api/brand-kits`. New kits are created with `is_default=False`; `_resolve_kit` uses a row with `is_default=True` when present (set in DB if you need a default). |

---

## 🎨 Layout & Navigation

| Feature | Status | Notes |
| --- | --- | --- |
| Sidebar / mobile / notifications | ✅ **IMPLEMENTED** | `LayoutShell`, `SocketProvider`, `BulkJobProvider` in root layout. |

---

## 📣 Campaigns (`/campaigns`)

| Feature | Status | Notes |
| --- | --- | --- |
| Generate / Kanban / commit | ✅ **IMPLEMENTED** | File-backed campaigns; bulk commit to draft posts. |
| Image auto-generation on commit | ❌ **NOT IMPLEMENTED** | Blueprints may carry `image_prompt` for manual follow-up. |

---

## 🔧 Backend API (selected)

| Area | Status | Notes |
| --- | --- | --- |
| `GET/POST /api/assets/*` | ✅ | Generate, upload, remix, list. |
| `GET/POST /api/posts/*` | ✅ | Includes `create-and-publish`, schedule, bulk endpoints per `posts.py`. |
| `GET/POST /api/brand-kits/*` | ✅ | Kits + logo uploads. |
| `POST /agent/*` (Composio) | ✅ | Instagram tooling via Composio MCP service. |
| Scheduler | ✅ | Due posts in `scheduler.py`. |
| Startup DB | ✅ | `create_all` + optional `brand_kit_id` column migration in `main.py`. |

---

## 📋 Summary

- **Fully implemented**: Core flows (assets, create, publish, campaigns, drafts, analytics data pipeline, brand kits, comments, scheduling).
- **Partial**: Channel OAuth in UI; approvals (API vs mock UI).
- **Mock**: Approvals page list.
- **Not implemented**: Automatic image gen on campaign commit; full multi-user RBAC; live engagement pulls from networks (beyond what’s wired).

### Recent alignment (March 2026)

- Image generation: **model fallbacks**, **`logo_path`** from Brand Kit for overlays, prompt assembly via **`build_remix_prompt`** and kit `system_prompt`.
- **No startup seed** of a default brand kit in current `main.py`. Kits are created via **`POST /api/brand-kits`** with `is_default=False`; generation/upload paths that call `_resolve_kit(None, …)` only pick up a kit if **`is_default=True`** exists in the database.
- **Analytics** asset metrics use **`meta_data.source`** consistently with the Assets page.

---

## Gaps & roadmap (concise)

- **LinkedIn / X publishing**: UI selectors; publishing logic not fully integrated for non-Instagram platforms.
- **Approvals**: Replace mock list with `GET /api/approvals/pending` (or equivalent) and wire actions.
- **Team / RBAC**, **live engagement metrics** from platform APIs: not implemented.

---

**Last Updated:** March 29, 2026  
**Based on:** Repository source (`backend/app`, `frontend/app`, `frontend/lib`).
