# Asset & Post Flow Analysis

## 1. Create Page Structure & State
**File**: `frontend/app/create/page.tsx`

### Top-Level Layout
The page follows a split-view layout:
- **Editor/Composer Column (Left)**: The primary workspace for crafting posts.
- **Preview Column (Right)**: Real-time visual representation of how the post will look on selected platforms (visible on `xl` screens).
- **Modals**:
    - **Asset Closet**: Integrated library for selecting generated images, drafts, campaigns, and brand kits.
    - **Schedule Modal**: Date/time picker for future publishing.
    - **Image Editor Modal**: In-app PIL-based editor for cropping and adjustments.

### State Variables
| Variable | Type | Initial Value | Purpose |
|----------|------|---------------|---------|
| `selectedChannels` | `string[]` | `['instagram']` | List of platform IDs (e.g., 'instagram', 'linkedin') selected for posting. |
| `caption` | `string` | `''` | Current text content of the post. |
| `media` | `Asset \| null` | `null` | The currently selected image/video asset for the post. |
| `isSubmitting` | `boolean` | `false` | Loading state for post creation/publishing. |
| `showAssetModal` | `boolean` | `false` | Controls visibility of the Asset Closet. |
| `showScheduleModal` | `boolean` | `false` | Controls visibility of the Schedule Modal. |
| `assets` | `Asset[]` | `[]` | List of all system assets (used for mapping IDs to objects). |
| `backendChannels` | `Channel[]` | `[]` | List of connected brand channels from the backend. |
| `previewPlatform` | `string` | `'instagram'` | Which platform's preview is currently active in the right panel. |
| `isGeneratingCaption` | `boolean` | `false` | Loading state for AI caption generation. |
| `closetTab` | `string` | `'assets'` | Active tab in Asset Closet ('assets', 'drafts', 'campaigns', 'brand_kits'). |
| `brandKits` | `BrandKit[]` | `[]` | List of available brand kits. |
| `selectedBrandKit` | `BrandKit \| null` | `null` | Currently selected kit in the Closet gallery flow. |
| `brandKitAssets` | `Asset[]` | `[]` | Assets filtered by the selected brand kit. |
| `showImageEditor` | `boolean` | `false` | Controls visibility of the PIL editor. |

### useEffect Hooks
1. **Mount Hook**: Fetches all connected channels (`connectorsApi.getAll`) and all assets (`assetsApi.getAll`) to populate local state.

### Visual Division
- **Composer Area**: Contains the channel selectors, caption textarea, and the media dropzone/preview.
- **Preview Area**: Shows a mobile-scaled preview for Instagram, LinkedIn, or Twitter.
- **Action Buttons**: Grouped in the sticky footer (Save as Draft, Save as Template, Schedule, Post Now).

### UI Elements
- **Caption Textarea**: Resizable input for text; includes a character count.
- **Platform Selector**: Pill-style buttons with brand icons; supports multi-selection.
- **Asset Closet Trigger**: "Open Asset Closet" button for existing media.
- **Upload Button**: A standard `<input type="file">` disguised as a button label.
- **AI Caption Button**: `Hash` icon calls `handleGenerateCaption` using the current text as context.
- **Schedule Button**: Opens a calendar modal for future timing.
- **Post Now Button**: Triggers immediate publishing to selected channels.
- **Save as Draft**: Creates a DB record with `status="draft"` for later editing.
- **Save as Template**: Saves the current combo to the file-based `Drafts` library (reusable templates).

---

## 2. Post Submission Flows

### "Post Now" Flow
1. **Handler**: `handlePost('published')`.
2. **Data Collection**: 
    - `content`: From `caption` state.
    - `media_assets`: Array containing `[media.id]` (if media exists).
    - `channels`: Array of backend database IDs corresponding to `selectedChannels`.
    - `status`: Always sent as `"draft"` initially (the `/create-and-publish` endpoint handles the promotion).
3. **API Call**: `POST /api/posts/create-and-publish`.
    - **Body**: `{ content, media_assets, status: "draft", channels, platform_settings: {} }`.
4. **Handling**: 
    - Success: Toasts success (noting if it's a mock or real publish), resets `caption` and `media`.
    - Error: Toasts the specific error (e.g., expired token) but keeps the post as a draft.

### "Save as Draft" Flow
1. **Handler**: `handlePost('draft')`.
2. **API Call**: `POST /api/posts/`. (Basic creation).
3. **Handling**: Toasts success and clears the composer.

### "Schedule Post" Flow
1. **Trigger**: User clicks "Schedule", selects a time in `ScheduleModal`, and confirms.
2. **Handler**: `handleScheduleConfirm(date)`.
3. **Logic**:
    - Calls `postsApi.create` to save the post as a draft.
    - Immediately calls `postsApi.schedule(postId, date)` to set the time and move status to `"scheduled"`.
4. **API Endpoints**: `POST /api/posts/` followed by `POST /api/posts/{id}/schedule`.

---

## 3. Asset Closet Modal

### Structure & Trigger
- **Trigger**: `handleOpenCloset` sets `showAssetModal(true)` and fetches all library data (kits, drafts, campaigns) in parallel.
- **Tabs**: 
    - **Generated Images**: Flat grid of all assets.
    - **Drafts**: Reusable JSON templates.
    - **Campaigns**: AI-generated multi-post blueprints.
    - **Brand Kits**: Multi-step flow for brand-specific filtering.

### Brand Kits Tab Flow
- Initially shows a **Grid of Brand Kits** (Name, Description, Logo).
- Clicking a kit calls `handleSelectBrandKit`, which moves to a **Gallery View** showing only assets linked to that `brand_kit_id`.
- Clicking "Back" returns to the kit list.

### Selection Logic
- **Selection**: Clicking an image asset calls `setMedia(asset)` and closes the modal.
- **Format**: The `media` state stores the full `Asset` object.
- **Multi-select**: Currently NOT supported in the main composer. The state `media` only holds a single asset. Carousel logic (multiple assets) exists in the backend model but the frontend UI currently only handles a single primary asset ID in the `media_assets` array.

---

## 4. AI Caption Generation
- **Button**: `Hash` icon in the caption area.
- **Handler**: `handleGenerateCaption`.
- **API Call**: `aiApi.generateCaption`.
    - **Inputs**: `prompt` (the snippet already typed), `platform` (the first selected channel), `tone` (presently hardcoded to `'professional'`).
- **Injection**: The returned `caption` string replaces the current state.
- **Hashtags**: Generally returned inline at the end of the caption string based on the backend AI prompt.

---

## 5. Post Creation Backend
**File**: `backend/app/routers/posts.py`

### Key Endpoints
- **`POST /api/posts/`**: 
    - **Body**: `PostCreate` (content, media_assets, channels, status, scheduled_time, platform_settings).
    - **Logic**: Strict DB insert.
- **`POST /api/posts/create-and-publish`**:
    - **Body**: `PostCreate`.
    - **Logic**: Creates post -> calls `publish_post_now()`. If publish fails, returns 200 with error details but keeps the post in the DB as `draft`.
- **`POST /api/posts/{id}/schedule`**:
    - **Body**: `{ scheduled_time: datetime, status: "scheduled" }`.
    - **Logic**: Normalizes time to UTC (assuming IST input) and updates the record.
- **`POST /api/posts/{id}/publish`**:
    - **Logic**: Manual trigger for an existing post.
- **`POST /api/posts/generate-bulk-variations`**: 
    - **Logic**: Generates N images via `generate_images_service` and N captions. Returns a list of variations. Images are saved as `Asset` rows.
- **`POST /api/posts/batch-create`**: 
    - **Logic**: Commits multiple variations as `Post` objects in one transaction. Fires `batch_posts_created` socket event.

### Data Storage
- **`media_assets`**: Stored as a `JSON` column in the `Post` model (list of integer CIDR IDs).
- **`platform_settings`**: Stored as a `JSON` blob. Currently used for campaign tracking or platform-specific overrides.

---

## 6. Image Generation Endpoint
**File**: `backend/app/routers/assets.py`

### `POST /api/assets/generate`
- **Request Body**:
    - `prompt`: User's visual description.
    - `count`: Number of variants (default 4).
    - `model`: AI model alias.
    - `brand_kit_id`: Optional ID to apply specific brand rules/logos.
- **Returns**: A list of full `Asset` objects.
- **Images per call**: Generates exactly `count` images.
- **Variation Logic**: A single call generates multiple *visual* variations of the same prompt. In the Bulk Flow, it also generates unique captions for each using GPT; the `Brand Overlay Engine` generates a unique minimalist caption overlay for each image based on its specific generated scene.
- **Brand Rules**: The `ONIDA_SYSTEM_PROMPT` fallback has been removed. Prompts and logos are fetched exclusively from the `BrandKit` at runtime.

---

## 7. Implementation Status (Bulk Create Flow)


### Endpoints Implemented
- **`POST /api/posts/generate-bulk-variations`**: Completed and verified. Generates $N$ `Asset` records and matching captions.
- **`POST /api/posts/batch-create`**: Completed and verified. Commits these variations to the `posts` table as drafts (1 primary, others secondary).

### Persistence Logic
- **Transient Assets**: Variations are created as real `Asset` rows immediately during the generation step so they have valid IDs and local file paths.
- **Batch Committing**: The `batch-create` endpoint moves these from "floating assets" to structured "Post drafts" in one transaction. 
- **Socket IO**: Fires `batch_posts_created` to notify the UI to refresh the calendar or list view.

### UI Integration Notes
- **Mode Toggle**: The Create page (frontend) uses a `createMode` state (`'manual' | 'ai'`) to cleanly separate the standard composer from the Bulk AI generator.
- **Bulk Job Context**: The frontend employs a global `BulkJobContext` allowing the slow generation request (`generateBulkVariations`) to run globally. Users can trigger generation, navigate away from the Create page to avoid locking their browser, and see toasts globally when generation completes.
- **Background Safety**: By decoupling the async call from the page component lifecycle, we eliminate abandoned promises if the React component unmounts.
- **Payload Handling**: The `VariationItem` response model includes the `AssetOut` object and the `caption`, allowing the frontend to render the collection immediately for user selection.
- **Batch Committing**: Using the `handleBatchSave` feature, users can commit all variations directly to unassigned drafts. The `is_primary` flag in the batch request determines which Post record is the "active" one currently loaded in the composer, while throwing the rest into the Draft Library.
