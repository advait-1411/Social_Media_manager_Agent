# VelvetQueue — Product Kit / AI Mode Blueprint

This document confirms the **current stack and data model** (as implemented) and records the **implemented behavior** for the Product Kit redesign and AI Mode.

---

## 1. Tech stack confirmation

### 1.1 Frontend framework, routing, and state

| Topic | Implementation |
| ----- | ---------------------- |
| **Framework** | **Next.js 16** |
| **Routing** | **App Router** |
| **State management** | **React component state** + **Context API** |
| **Styling / motion** | Tailwind CSS 4, Framer Motion, Lucide icons, Sonner toasts |
| **Real-time** | Socket.io client via `SocketProvider` |

### 1.2 Backend and API

| Topic | Implementation |
| ----- | ---------------------- |
| **API style** | **REST** (FastAPI routers) |
| **Backend runtime** | **Python**, **FastAPI**, **python-socketio** |
| **DB** | **SQLite** via SQLAlchemy |
| **ORM** | **SQLAlchemy** (`backend/app/models/models.py`) |

---

## 2. Product Kit / Asset model

### 2.1 DB tables and fields

**Table: `brand_kits` (Product Kit)**

| Field | Type | Notes |
| ----- | ---- | ----- |
| `id` | Integer | PK |
| `name` | String | Product Kit Name |
| `description` | Text | Optional |
| `system_prompt` | Text | Legacy field; mapped to **Product Guidelines** |
| `product_guidelines`| Text | Visual/brand constraints for image generation |
| `logo_light_path` | String | Legacy; replaced by `KitAsset` |
| `is_default` | Boolean | Default `False` |

**Table: `kit_assets` (NEW)**

| Field | Type | Notes |
| ----- | ---- | ----- |
| `id` | Integer | PK |
| `product_kit_id` | Integer | FK to `brand_kits.id` |
| `name` | String | User-defined label |
| `token` | String | Unique slug for `@tag` mentions |
| `asset_type` | Enum | `product_asset` (gen) \| `logo_trademark` (overlay) |
| `file_path` | String | Filesystem path |
| `usable_in_generation`| Bool | True for product assets |
| `usable_for_overlay`| Bool | True for logo assets |

**Table: `assets` (Generated/Uploaded)**

| Field | Type | Notes |
| ----- | ---- | ----- |
| `id` | Integer | PK |
| `file_path` | String | Storage path |
| `brand_kit_id` | Integer | Link to Product Kit |
| `meta_data` | JSON | Tracking `source`, `tags`, `model`, etc. |

---

## 3. Implemented B2B Rules

### 3.1 Terminology

| Legacy | NEW (Implemented) |
| ------- | -------------- |
| Brand Kit | **Product Kit** |
| System Prompt | **Product Guidelines** |

### 3.2 Safety and Filtering

1.  **LOGO_SAFETY_RULE**: Assets typed as `logo_trademark` are strictly prohibited from entering image generation prompts. They are reserved for the post-generation `OverlayService`.
2.  **PRODUCT_GUIDELINES_RULE**: Guidelines are injected into image generation prompts only. They are intentionally excluded from caption generation to prevent hallucinated visual descriptions in text.

---

## 4. AI Mode Chat

### 4.1 Behavior

- **Tag Parsing**: The backend parses `@name` or `@token` mentions in chat messages.
- **Kit Inference**: If all tagged assets belong to the same Product Kit, that kit is automatically used.
- **Ambiguity Handling**: If assets from multiple kits are tagged, the system returns an `AmbiguousKitError`.

### 4.2 Prompting

- **Inference**: Prompt builds use `@tag` context to describe product references to the AI.
- **Guidelines**: The kit's `product_guidelines` are appended to the generation request.

---

## 5. Overlay Pipeline

### 5.1 Overlay Selection

- The system automatically identifies the primary `logo_trademark` for a kit.
- **OverlayService**: Applies semi-transparent, professionally placed logos after the AI image is generated/remixed.

---

## 6. Implementation Status (All Phases COMPLETE)

| Phase | Description | Status |
| ----- | ----------- | ------ |
| **Phase 1** | Rename UI components to Product Kit / Guidelines. | ✅ **DONE** |
| **Phase 2** | Introduce `KitAsset` model and typed uploads. | ✅ **DONE** |
| **Phase 3** | AI Mode Chat with tag parsing and kit inference. | ✅ **DONE** |
| **Phase 4** | Cascade delete and visual asset previews in Settings. | ✅ **DONE** |

---

**Last Updated:** March 29, 2026  
**Confirms Implementation of:** VelvetQueue B2B Pivot.
