/**
 * API Client for VelvetQueue
 * Centralized API calls with consistent error handling
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Helper for fetch with error handling
async function apiFetch<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `API error: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Unknown API error');
  }
}

// Profile API
export const profileApi = {
  getOverview: async (platform: string, channelId?: number) => {
    const params = new URLSearchParams({ platform });
    if (channelId) params.append('channel_id', channelId.toString());

    return apiFetch(`/api/profile/overview?${params}`);
  },

  getPosts: async (
    platform: string,
    channelId?: number,
    page: number = 1,
    pageSize: number = 12
  ) => {
    const params = new URLSearchParams({
      platform,
      page: page.toString(),
      page_size: pageSize.toString(),
    });
    if (channelId) params.append('channel_id', channelId.toString());

    return apiFetch(`/api/profile/posts?${params}`);
  },
};

// Comments API
export const commentsApi = {
  syncComments: async (postId: number) => {
    return apiFetch(`/api/posts/${postId}/comments/sync`);
  },

  getComments: async (
    postId: number,
    filters?: {
      sentiment?: string;
      category?: string;
      unrepliedOnly?: boolean;
    }
  ) => {
    const params = new URLSearchParams();
    if (filters?.sentiment) params.append('sentiment', filters.sentiment);
    if (filters?.category) params.append('category', filters.category);
    if (filters?.unrepliedOnly) params.append('unreplied_only', 'true');

    const query = params.toString();
    return apiFetch(`/api/posts/${postId}/comments${query ? `?${query}` : ''}`);
  },

  suggestReply: async (commentId: number, tone: string = 'friendly') => {
    return apiFetch(`/api/comments/${commentId}/suggest-reply`, {
      method: 'POST',
      body: JSON.stringify({ tone }),
    });
  },

  postReply: async (commentId: number, replyText: string) => {
    return apiFetch(`/api/comments/${commentId}/reply`, {
      method: 'POST',
      body: JSON.stringify({ reply_text: replyText }),
    });
  },

  postFirstComment: async (postId: number, text: string) => {
    return apiFetch(`/api/posts/${postId}/comments/first`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
  },

  updateSettings: async (
    postId: number,
    settings: {
      comments_enabled?: boolean;
      hide_like_count?: boolean;
    }
  ) => {
    return apiFetch(`/api/posts/${postId}/comments/settings`, {
      method: 'POST',
      body: JSON.stringify(settings),
    });
  },
};

// ---------------------------------------------------------------------------
// Variation and Bulk Generation types
// ---------------------------------------------------------------------------

export type VariationItem = {
  asset: {
    id: number;
    file_path: string;
    asset_type: string;
    prompt?: string | null;
    system_prompt?: string | null;
    tags?: string[] | null;
    created_at: string;
    meta_data?: Record<string, any> | null;
    brand_kit_id?: number | null;
  };
  caption: string;
  brand_kit_id?: number | null;
};

// Posts API
export const postsApi = {
  getAll: async (status?: string) => {
    const params = status ? `?status=${status}` : '';
    return apiFetch(`/api/posts/${params}`);
  },

  getById: async (postId: number) => {
    return apiFetch(`/api/posts/${postId}`);
  },

  create: async (postData: any) => {
    return apiFetch(`/api/posts/`, {
      method: 'POST',
      body: JSON.stringify(postData),
    });
  },

  update: async (postId: number, updates: any) => {
    return apiFetch(`/api/posts/${postId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  publish: async (postId: number) => {
    return apiFetch(`/api/posts/${postId}/publish`, {
      method: 'POST',
    });
  },

  schedule: async (postId: number, scheduledTime: string) => {
    return apiFetch(`/api/posts/${postId}/schedule`, {
      method: 'POST',
      body: JSON.stringify({ scheduled_time: scheduledTime, status: 'scheduled' }),
    });
  },

  getCalendar: async (startDate: string, endDate: string, status: string = 'scheduled') => {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
      status
    });
    return apiFetch(`/api/posts/calendar?${params}`);
  },

  generateBulkVariations: async (params: {
    prompt: string;
    brand_kit_id?: number | null;
    count?: number;
  }): Promise<VariationItem[]> => {
    const response = await apiFetch<{ variations: VariationItem[] }>('/api/posts/generate-bulk-variations', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    return response.variations;
  },

  batchCreate: async (payload: {
    variations: Array<{
      asset_id: number;
      caption: string;
      is_primary: boolean;
    }>;
    channels?: number[];
    platforms?: string[];
    brand_kit_id?: number | null;
    platform_settings?: Record<string, any>;
  }): Promise<any> => {
    return apiFetch('/api/posts/batch-create', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }
};

// Connectors API
export const connectorsApi = {
  getAll: async () => {
    return apiFetch(`/api/connectors/`);
  },

  connect: async (platform: string, credentials: any) => {
    return apiFetch(`/api/connectors/connect`, {
      method: 'POST',
      body: JSON.stringify({ platform, ...credentials }),
    });
  },
};

// Assets API
export const assetsApi = {
  getAll: async () => {
    return apiFetch(`/api/assets/`);
  },

  generate: async (prompt: string, numImages: number = 4) => {
    return apiFetch(`/api/assets/generate`, {
      method: 'POST',
      body: JSON.stringify({ prompt, num_images: numImages }),
    });
  },

  upload: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE}/api/assets/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || 'Upload failed');
    }

    return await response.json();
  },

  remix: async (assetId: number, prompt: string, numVariants: number = 1) => {
    return apiFetch(`/api/assets/${assetId}/remix`, {
      method: 'POST',
      body: JSON.stringify({ prompt, num_variants: numVariants }),
    });
  },
};

// AI API
export const aiApi = {
  generateCaption: async (prompt: string, platform?: string, tone?: string) => {
    return apiFetch(`/api/ai/generate-caption`, {
      method: 'POST',
      body: JSON.stringify({ prompt, platform, tone }),
    });
  },

  repurpose: async (caption: string, targetPlatform: string) => {
    return apiFetch(`/api/ai/repurpose`, {
      method: 'POST',
      body: JSON.stringify({ caption, target_platform: targetPlatform }),
    });
  },

  generateHashtags: async (content: string) => {
    return apiFetch(`/api/ai/hashtags`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  },
};

// ---------------------------------------------------------------------------
// Campaigns – TypeScript interfaces (file-backed)
// ---------------------------------------------------------------------------

export interface PostBlueprint {
  blueprint_id: string;
  platform: string;           // "instagram" | "linkedin" | "twitter"
  asset_id?: number | null;
  asset_ids?: number[] | null; // Carousel: multiple assets
  image_prompt?: string | null;
  caption: string;
  hashtags: string[];
  status?: string;            // "blueprint" | "committed"
}

export interface CampaignFile {
  id: string;
  title: string;
  strategy: string;
  created_at: string;
  updated_at: string;
  business_context?: string | null;
  guidelines?: Record<string, any> | null;
  platforms: string[];
  posts: PostBlueprint[];
}

/** CampaignFile as returned by /generate – may carry an optional schedule hint from the AI. */
export interface CampaignBlueprint extends CampaignFile {
  schedule_hint?: string | null;
}

export interface CampaignMeta {
  id: string;
  title: string;
  strategy: string;
  created_at: string;
  platforms: string[];
  post_count: number;
}

export interface CampaignGenerationRequest {
  prompt: string;
  business_context?: string;
  asset_ids?: number[];
  logo_id?: number;
  platforms?: string[];
  guidelines?: Record<string, any>;
  num_campaigns?: number;
  posts_per_campaign?: number;
}

export interface CommitCampaignRequest {
  blueprint_ids: string[];
  default_status?: string;
}

export interface CommitCampaignResponse {
  created_post_ids: number[];
  message: string;
}

// Campaigns API client
export const campaignsApi = {
  generate: async (payload: CampaignGenerationRequest): Promise<{ campaigns: CampaignBlueprint[] }> => {
    return apiFetch('/api/campaigns/generate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  list: async (): Promise<CampaignMeta[]> => {
    return apiFetch('/api/campaigns/');
  },

  getById: async (id: string): Promise<CampaignFile> => {
    return apiFetch(`/api/campaigns/${id}`);
  },

  update: async (id: string, updates: Partial<CampaignFile>) => {
    return apiFetch(`/api/campaigns/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  delete: async (id: string) => {
    return apiFetch(`/api/campaigns/${id}`, {
      method: 'DELETE',
    });
  },

  commit: async (id: string, payload: CommitCampaignRequest): Promise<CommitCampaignResponse> => {
    return apiFetch(`/api/campaigns/${id}/commit`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};

// ---------------------------------------------------------------------------
// Drafts – TypeScript interfaces
// ---------------------------------------------------------------------------

export interface DraftFile {
  id: string;
  caption: string;
  asset_ids: number[];
  platforms: string[];
  created_at: string;
  updated_at: string;
  source?: string;
}

export interface DraftMeta {
  id: string;
  caption: string;
  platforms: string[];
  created_at: string;
  updated_at: string;
  asset_count: number;
}

export interface DraftCreateRequest {
  caption: string;
  asset_ids?: number[];
  platforms?: string[];
  source?: string;
}

export interface DraftCommitResponse {
  post_id: number;
  message: string;
}

// Drafts API client
export const draftsApi = {
  list: async (): Promise<DraftMeta[]> => {
    return apiFetch('/api/drafts/');
  },

  getById: async (id: string): Promise<DraftFile> => {
    return apiFetch(`/api/drafts/${id}`);
  },

  create: async (payload: DraftCreateRequest): Promise<DraftFile> => {
    return apiFetch('/api/drafts/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  update: async (id: string, updates: Partial<DraftCreateRequest>): Promise<DraftFile> => {
    return apiFetch(`/api/drafts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  delete: async (id: string) => {
    return apiFetch(`/api/drafts/${id}`, {
      method: 'DELETE',
    });
  },

  commit: async (id: string): Promise<DraftCommitResponse> => {
    return apiFetch(`/api/drafts/${id}/commit`, {
      method: 'POST',
    });
  },
};

// Analytics API client
export const analyticsApi = {
  getPosts: async (): Promise<any[]> => {
    return apiFetch('/api/posts/');
  },
  getAssets: async (): Promise<any[]> => {
    return apiFetch('/api/assets/');
  }
};

// ---------------------------------------------------------------------------
// Product Kits — typed KitAsset support
// ---------------------------------------------------------------------------

export interface KitAsset {
  id: number;
  product_kit_id: number;
  name: string;
  token: string;
  asset_type: 'product_asset' | 'logo_trademark';
  file_path: string;
  mime_type?: string | null;
  usable_in_generation: boolean;
  usable_for_overlay: boolean;
  created_at: string;
}

export interface ProductKit {
  id: number;
  name: string;
  description?: string | null;
  system_prompt: string;
  product_guidelines: string;
  logo_light_path?: string | null;
  logo_dark_path?: string | null;
  is_default: boolean;
  created_at: string;
  updated_at?: string | null;
  asset_count: number;
  kit_assets: KitAsset[];
}

export const productKitsApi = {
  list: async (): Promise<ProductKit[]> => {
    return apiFetch('/api/brand-kits/');
  },

  create: async (payload: {
    name: string;
    description?: string;
    product_guidelines: string;
  }): Promise<ProductKit> => {
    return apiFetch('/api/brand-kits/', {
      method: 'POST',
      body: JSON.stringify({
        name: payload.name,
        description: payload.description,
        system_prompt: payload.product_guidelines,
        product_guidelines: payload.product_guidelines,
      }),
    });
  },

  update: async (kitId: number, payload: {
    name?: string;
    description?: string;
    product_guidelines?: string;
  }): Promise<ProductKit> => {
    return apiFetch(`/api/brand-kits/${kitId}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: payload.name,
        description: payload.description,
        product_guidelines: payload.product_guidelines,
        system_prompt: payload.product_guidelines,
      }),
    });
  },

  delete: async (kitId: number): Promise<void> => {
    return apiFetch(`/api/brand-kits/${kitId}`, { method: 'DELETE' });
  },

  uploadLogo: async (kitId: number, logoLight?: File, logoDark?: File): Promise<ProductKit> => {
    const fd = new FormData();
    if (logoLight) fd.append('logo_light', logoLight);
    if (logoDark) fd.append('logo_dark', logoDark);
    const res = await fetch(`${API_BASE}/api/brand-kits/${kitId}/logo`, {
      method: 'POST',
      body: fd,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as any).detail || 'Logo upload failed');
    }
    return res.json();
  },

  uploadKitAsset: async (
    kitId: number,
    file: File,
    name: string,
    assetType: 'product_asset' | 'logo_trademark'
  ): Promise<KitAsset> => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('name', name);
    fd.append('asset_type', assetType);
    const res = await fetch(`${API_BASE}/api/brand-kits/${kitId}/assets/upload`, {
      method: 'POST',
      body: fd,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as any).detail || 'Asset upload failed');
    }
    return res.json();
  },

  listKitAssets: async (kitId: number, assetType?: string): Promise<KitAsset[]> => {
    const params = assetType ? `?asset_type=${assetType}` : '';
    return apiFetch(`/api/brand-kits/${kitId}/assets${params}`);
  },

  deleteKitAsset: async (kitId: number, assetId: number): Promise<void> => {
    return apiFetch(`/api/brand-kits/${kitId}/assets/${assetId}`, { method: 'DELETE' });
  },
};

// ---------------------------------------------------------------------------
// AI Mode — chat-style generation endpoint
// ---------------------------------------------------------------------------

export interface AIModeResult {
  asset_id: number;
  file_path: string;
  caption: string;
  product_kit_id?: number | null;
  product_kit_name?: string | null;
  overlay_applied: boolean;
  message: string;
}

export const aiModeApi = {
  generate: async (message: string, model?: string): Promise<AIModeResult> => {
    return apiFetch('/api/posts/ai-generate', {
      method: 'POST',
      body: JSON.stringify({ message, model: model ?? 'google/gemini-3-pro-image-preview' }),
    });
  },
};
