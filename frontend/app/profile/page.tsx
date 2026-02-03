'use client';

import { useState, useEffect } from 'react';
import { profileApi, connectorsApi } from '@/lib/api';
import { toast } from 'sonner';

interface Channel {
    id: number;
    platform: string;
    name: string;
    is_active: boolean;
}

interface ProfileData {
    display_name: string;
    platform: string;
    channel_id: number;
    connected: boolean;
    total_posts: number;
    published_posts: number;
    latest_posts: Array<{
        post_id: number;
        caption: string;
        status: string;
        created_at: string;
        published_at?: string;
        thumbnail_url?: string;
    }>;
}

export default function ProfilePage() {
    const [selectedPlatform, setSelectedPlatform] = useState('instagram');
    const [selectedChannel, setSelectedChannel] = useState<number | undefined>();
    const [channels, setChannels] = useState<Channel[]>([]);
    const [profileData, setProfileData] = useState<ProfileData | null>(null);
    const [loading, setLoading] = useState(true);

    // Fetch channels on mount
    useEffect(() => {
        fetchChannels();
    }, []);

    // Fetch profile data when platform or channel changes
    useEffect(() => {
        if (selectedPlatform) {
            fetchProfileData();
        }
    }, [selectedPlatform, selectedChannel]);

    const fetchChannels = async () => {
        try {
            const data = await connectorsApi.getAll();
            setChannels(data);

            // Auto-select first channel for selected platform
            const platformChannels = data.filter((c: Channel) => c.platform === selectedPlatform);
            if (platformChannels.length > 0) {
                setSelectedChannel(platformChannels[0].id);
            }
        } catch (error) {
            console.error('Failed to fetch channels:', error);
            toast.error('Failed to load channels');
        }
    };

    const fetchProfileData = async () => {
        setLoading(true);
        try {
            const data = await profileApi.getOverview(selectedPlatform, selectedChannel);
            setProfileData(data);
        } catch (error: any) {
            console.error('Failed to fetch profile data:', error);
            toast.error(error.message || 'Failed to load profile data');
        } finally {
            setLoading(false);
        }
    };

    const platformChannels = channels.filter(c => c.platform === selectedPlatform);

    return (
        <div className="p-8 max-w-7xl mx-auto">
            <h1 className="text-3xl font-bold mb-8">Profile</h1>

            {/* Platform and Account Selectors */}
            <div className="flex gap-4 mb-8">
                {/* Platform Dropdown */}
                <div>
                    <label className="block text-sm font-medium mb-2">Platform</label>
                    <select
                        value={selectedPlatform}
                        onChange={(e) => {
                            setSelectedPlatform(e.target.value);
                            // Reset channel selection
                            const newPlatformChannels = channels.filter(c => c.platform === e.target.value);
                            if (newPlatformChannels.length > 0) {
                                setSelectedChannel(newPlatformChannels[0].id);
                            } else {
                                setSelectedChannel(undefined);
                            }
                        }}
                        className="px-4 py-2 border rounded-lg bg-white"
                    >
                        <option value="instagram">Instagram</option>
                        <option value="linkedin" disabled>LinkedIn (Coming Soon)</option>
                        <option value="twitter" disabled>Twitter (Coming Soon)</option>
                        <option value="pinterest" disabled>Pinterest (Coming Soon)</option>
                    </select>
                </div>

                {/* Account Dropdown */}
                {platformChannels.length > 0 && (
                    <div>
                        <label className="block text-sm font-medium mb-2">Account</label>
                        <select
                            value={selectedChannel || ''}
                            onChange={(e) => setSelectedChannel(Number(e.target.value))}
                            className="px-4 py-2 border rounded-lg bg-white"
                        >
                            {platformChannels.map((channel) => (
                                <option key={channel.id} value={channel.id}>
                                    {channel.name}
                                </option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {loading ? (
                <div className="text-center py-12">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                    <p className="mt-4 text-gray-600">Loading profile...</p>
                </div>
            ) : profileData ? (
                <>
                    {/* Codolio-style Profile Section */}
                    <div className="bg-white rounded-lg shadow-md p-6 mb-8">
                        <div className="flex items-start justify-between">
                            {/* Left: Avatar and Info */}
                            <div className="flex items-center gap-4">
                                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-2xl font-bold">
                                    {profileData.display_name.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <h2 className="text-2xl font-bold">{profileData.display_name}</h2>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-medium">
                                            {profileData.platform.charAt(0).toUpperCase() + profileData.platform.slice(1)}
                                        </span>
                                        {profileData.connected && (
                                            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                                                Connected
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Right: Stats */}
                            <div className="flex gap-8">
                                <div className="text-center">
                                    <div className="text-3xl font-bold text-gray-900">{profileData.total_posts}</div>
                                    <div className="text-sm text-gray-600">Total Posts</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-3xl font-bold text-green-600">{profileData.published_posts}</div>
                                    <div className="text-sm text-gray-600">Published</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Post Grid */}
                    <div>
                        <h3 className="text-xl font-bold mb-4">Recent Posts</h3>
                        {profileData.latest_posts.length === 0 ? (
                            <div className="text-center py-12 bg-gray-50 rounded-lg">
                                <p className="text-gray-600">No posts yet</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                {profileData.latest_posts.map((post) => (
                                    <div
                                        key={post.post_id}
                                        className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow"
                                    >
                                        {/* Thumbnail */}
                                        {post.thumbnail_url ? (
                                            <div className="aspect-square bg-gray-200 relative">
                                                <img
                                                    src={post.thumbnail_url}
                                                    alt="Post thumbnail"
                                                    className="w-full h-full object-cover"
                                                />
                                                {/* Status Badge */}
                                                <div className="absolute top-2 right-2">
                                                    <span
                                                        className={`px-2 py-1 rounded text-xs font-medium ${post.status === 'published' || post.status === 'posted'
                                                                ? 'bg-green-500 text-white'
                                                                : post.status === 'scheduled'
                                                                    ? 'bg-blue-500 text-white'
                                                                    : 'bg-gray-500 text-white'
                                                            }`}
                                                    >
                                                        {post.status}
                                                    </span>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="aspect-square bg-gray-200 flex items-center justify-center">
                                                <span className="text-gray-400">No image</span>
                                            </div>
                                        )}

                                        {/* Caption */}
                                        <div className="p-3">
                                            <p className="text-sm text-gray-700 line-clamp-2">
                                                {post.caption || 'No caption'}
                                            </p>
                                            <p className="text-xs text-gray-500 mt-2">
                                                {new Date(post.created_at).toLocaleDateString()}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            ) : (
                <div className="text-center py-12 bg-gray-50 rounded-lg">
                    <p className="text-gray-600">No profile data available</p>
                </div>
            )}
        </div>
    );
}
