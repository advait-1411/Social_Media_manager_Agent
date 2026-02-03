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
