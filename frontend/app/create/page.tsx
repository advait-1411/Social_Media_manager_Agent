"use client"

import { useState, useEffect } from 'react';
import {
    Instagram, Linkedin, Twitter,
    Image as ImageIcon, Smile, Hash,
    Calendar, Send, ChevronDown, Check, MoreHorizontal, Loader2, X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, LayoutGroup, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { connectorsApi, assetsApi, postsApi, aiApi } from '@/lib/api';
import { ScheduleModal } from '@/components/schedule-modal';

const CHANNELS = [
    { id: 'instagram', name: 'Instagram', icon: Instagram, color: 'text-pink-600', active: true },
    { id: 'linkedin', name: 'LinkedIn', icon: Linkedin, color: 'text-blue-700', active: false },
    { id: 'twitter', name: 'X / Twitter', icon: Twitter, color: 'text-black', active: false },
];

interface Asset {
    id: number;
    file_path: string;
    prompt: string;
}

interface Channel {
    id: number;
    platform: string;
    name: string;
}

export default function CreatePage() {
    const [selectedChannels, setSelectedChannels] = useState(['instagram']);
    const [caption, setCaption] = useState('');
    const [media, setMedia] = useState<Asset | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showAssetModal, setShowAssetModal] = useState(false);
    const [showScheduleModal, setShowScheduleModal] = useState(false);
    const [assets, setAssets] = useState<Asset[]>([]);
    const [backendChannels, setBackendChannels] = useState<Channel[]>([]);
    const [previewPlatform, setPreviewPlatform] = useState('instagram');
    const [isGeneratingCaption, setIsGeneratingCaption] = useState(false);

    useEffect(() => {
        connectorsApi.getAll()
            .then((data: any) => setBackendChannels(data as Channel[]))
            .catch(err => {
                console.error("Failed to fetch channels", err);
                toast.error('Failed to load channels');
            });

        assetsApi.getAll()
            .then((data: any) => setAssets(data as Asset[]))
            .catch(err => {
                console.error("Failed to fetch assets", err);
                toast.error('Failed to load assets');
            });
    }, []);

    const toggleChannel = (id: string) => {
        setSelectedChannels(prev =>
            prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
        );
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const uploadedAsset = await assetsApi.upload(file);
            setMedia(uploadedAsset);
            toast.success('File uploaded successfully');

            // Refresh assets list
            assetsApi.getAll()
                .then((data: any) => setAssets(data))
                .catch(err => console.error("Failed to fetch assets", err));
        } catch (error: any) {
            console.error("Upload error:", error);
            toast.error(error.message || 'Failed to upload file');
        } finally {
            // Reset file input
            e.target.value = '';
        }
    };

    const handleGenerateCaption = async () => {
        if (!caption.trim()) {
            toast.message("Type a few words first", {
                description: "AI needs some context to generate a caption."
            });
            return;
        }

        setIsGeneratingCaption(true);
        try {
            // Determine platform context
            const primaryPlatform = selectedChannels.length > 0 ? selectedChannels[0] : previewPlatform;

            const response = await aiApi.generateCaption(caption, primaryPlatform, 'professional') as { caption: string };

            if (response.caption) {
                setCaption(response.caption);
                toast.success("Caption generated with AI!");
            } else {
                throw new Error("Empty response from AI");
            }
        } catch (error: any) {
            console.error("Caption generation error:", error);
            toast.error(error.message || "Could not generate caption. Please try again.");
        } finally {
            setIsGeneratingCaption(false);
        }
    };

    const handlePost = async (status: 'draft' | 'published' = 'draft') => {
        if (!caption && !media) {
            toast.error("Please add some content or media");
            return;
        }

        setIsSubmitting(true);
        try {
            const channelIds: number[] = [];
            if (selectedChannels.includes('instagram')) {
                const ig = backendChannels.find(c => c.platform === 'instagram');
                if (ig) channelIds.push(ig.id);
            }

            const payload = {
                content: caption,
                media_assets: media ? [media.id] : [],
                status: status === 'published' ? 'draft' : 'draft',
                channels: channelIds,
                platform_settings: {}
            };

            const data = await postsApi.create(payload) as { id: number };

            if (status === 'published') {
                try {
                    const pubData = await postsApi.publish(data.id) as { mock?: boolean };

                    if (pubData.mock) {
                        toast.warning("Post simulated! (Localhost mode)");
                    } else {
                        toast.success("Post published successfully to Instagram!");
                    }
                } catch (pubError: any) {
                    const errorMsg = pubError.message || "Publishing failed";

                    // Check for token expiration
                    if (errorMsg.includes("expired") || errorMsg.includes("token")) {
                        toast.error(`Publishing failed: ${errorMsg}. Please update your Instagram access token.`, {
                            duration: 5000,
                        });
                    } else {
                        toast.error(`Publishing failed: ${errorMsg}`);
                    }
                    throw pubError;
                }
            } else {
                toast.success("Post saved as draft!");
            }

            setCaption('');
            setMedia(null);

        } catch (error: any) {
            console.error(error);
            if (!error.message?.includes('Publishing failed')) {
                toast.error(error.message || "Something went wrong");
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleScheduleConfirm = async (date: string) => {
        if (!caption && !media) {
            toast.error("Please add some content or media");
            return;
        }

        try {
            const channelIds: number[] = [];
            if (selectedChannels.includes('instagram')) {
                const ig = backendChannels.find(c => c.platform === 'instagram');
                if (ig) channelIds.push(ig.id);
            }

            const payload = {
                content: caption,
                media_assets: media ? [media.id] : [],
                status: 'draft',
                channels: channelIds,
                platform_settings: {}
            };

            // 1. Create Post
            const data = await postsApi.create(payload) as { id: number };

            // 2. Schedule Post
            await postsApi.schedule(data.id, date);

            toast.success(`Post scheduled for ${new Date(date).toLocaleString()}`);
            setShowScheduleModal(false);

            // Reset form
            setCaption('');
            setMedia(null);

        } catch (error: any) {
            console.error(error);
            toast.error(error.message || "Failed to schedule post");
            // Do NOT re-throw, so modal stays open or we handle it gracefully?
            // Existing logic: catch and toast.
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="h-[calc(100vh-140px)] flex gap-6"
        >

            {/* Editor Column */}
            <div className="flex-1 bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col overflow-hidden">
                {/* Channel Selector */}
                <div className="p-4 border-b border-gray-100 flex items-center gap-3 bg-gray-50/50">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Post To:</span>
                    <div className="flex gap-2">
                        <LayoutGroup>
                            {CHANNELS.map(ch => {
                                const isSelected = selectedChannels.includes(ch.id);
                                return (
                                    <button
                                        key={ch.id}
                                        onClick={() => toggleChannel(ch.id)}
                                        className={cn(
                                            "relative flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors z-0",
                                            isSelected
                                                ? "border-blue-200 text-gray-900"
                                                : "bg-transparent border-transparent text-gray-400 hover:bg-gray-100"
                                        )}
                                    >
                                        {isSelected && (
                                            <motion.div
                                                layoutId="selectedChannelBg"
                                                className="absolute inset-0 bg-white rounded-full shadow-sm ring-1 ring-blue-100 -z-10"
                                                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                            />
                                        )}
                                        <ch.icon className={cn("w-4 h-4 relative z-10", isSelected ? ch.color : "text-gray-400")} />
                                        <span className="relative z-10">{ch.name}</span>
                                        {isSelected && <Check className="w-3 h-3 ml-1 text-blue-500 relative z-10" />}
                                    </button>
                                );
                            })}
                        </LayoutGroup>
                    </div>
                </div>

                {/* Composer Body */}
                <div className="flex-1 p-6 overflow-y-auto space-y-6">

                    {/* Caption */}
                    <div className="space-y-2">
                        <motion.div
                            whileFocus={{ scale: 1.01 }}
                            className="origin-top"
                        >
                            <textarea
                                className={cn(
                                    "w-full h-32 p-4 rounded-xl border border-gray-200 resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-base placeholder:text-gray-400 transition-shadow shadow-sm",
                                    isGeneratingCaption && "opacity-50"
                                )}
                                placeholder="What's on your mind? Type a few words for context..."
                                value={caption}
                                onChange={(e) => setCaption(e.target.value)}
                                disabled={isGeneratingCaption}
                            />
                        </motion.div>
                        <div className="flex items-center justify-between px-1">
                            <div className="flex gap-2">
                                <button
                                    onClick={handleGenerateCaption}
                                    disabled={isGeneratingCaption}
                                    className={cn(
                                        "text-gray-400 hover:text-blue-600 transition hover:scale-110 flex items-center gap-2",
                                        isGeneratingCaption && "pointer-events-none animate-pulse text-blue-500"
                                    )}
                                    title="Generate caption & hashtags with AI"
                                >
                                    {isGeneratingCaption ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : (
                                        <Hash className="w-5 h-5" />
                                    )}
                                </button>
                            </div>
                            <span className="text-xs text-gray-400">{caption.length} chars</span>
                        </div>
                    </div>

                    {/* Media Area */}
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-gray-700">Media</label>
                        <motion.div layout>
                            {media ? (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="relative aspect-video rounded-xl overflow-hidden border border-gray-200 group shadow-md"
                                >
                                    <div className="w-full h-full bg-gray-100 flex items-center justify-center overflow-hidden">
                                        <img
                                            src={`http://localhost:8000/${media.file_path.replace(/^\.?\//, '')}`}
                                            alt="Selected"
                                            className="w-full h-full object-cover"
                                        />
                                    </div>
                                    <button
                                        onClick={() => setMedia(null)}
                                        className="absolute top-2 right-2 bg-white/80 p-1 rounded-full text-gray-600 hover:text-red-600 transition-colors"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </motion.div>
                            ) : (
                                <motion.div
                                    whileHover={{ backgroundColor: "rgba(249, 250, 251, 1)", borderColor: "#93C5FD" }}
                                    className="border-2 border-dashed border-gray-200 rounded-xl p-8 transition-colors text-center cursor-pointer"
                                >
                                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-50 mb-3 text-blue-600">
                                        <ImageIcon className="w-6 h-6" />
                                    </div>
                                    <p className="text-sm font-medium text-gray-900">Add photos or video</p>
                                    <p className="text-xs text-gray-500 mt-1">Drag and drop, or choose from...</p>

                                    <div className="flex gap-3 justify-center mt-4">
                                        <label className="text-xs bg-white border border-gray-300 px-3 py-1.5 rounded-md font-medium text-gray-700 hover:bg-gray-50 hover:scale-105 transition-transform cursor-pointer">
                                            <input
                                                type="file"
                                                accept="image/*,video/*"
                                                className="hidden"
                                                onChange={handleFileUpload}
                                            />
                                            Upload
                                        </label>
                                        <button
                                            onClick={() => setShowAssetModal(true)}
                                            className="text-xs bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-md font-medium text-blue-700 hover:bg-blue-100 hover:scale-105 transition-transform"
                                        >
                                            Open Asset Closet
                                        </button>
                                    </div>
                                </motion.div>
                            )}
                        </motion.div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="p-4 border-t border-gray-100 flex justify-between items-center bg-gray-50/30">
                    <button onClick={() => handlePost('draft')} disabled={isSubmitting} className="text-gray-500 text-sm font-medium hover:text-gray-900 px-2 transition-colors">
                        Save as Draft
                    </button>
                    <div className="flex gap-2">
                        <button
                            disabled={isSubmitting}
                            onClick={() => setShowScheduleModal(true)}
                            className="bg-white border text-gray-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-50 shadow-sm flex items-center gap-2 hover:shadow transition-all active:scale-95"
                        >
                            <Calendar className="w-4 h-4" /> Schedule
                        </button>
                        <div className="relative flex shadow-sm rounded-lg">
                            <button
                                onClick={() => handlePost('published')}
                                disabled={isSubmitting}
                                className="bg-blue-600 text-white px-5 py-2 rounded-l-lg font-medium hover:bg-blue-700 flex items-center gap-2 border-r border-blue-700 transition-all hover:pr-6 disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                Post Now
                            </button>
                            <button className="bg-blue-600 text-white px-2 rounded-r-lg hover:bg-blue-700 transition-colors">
                                <ChevronDown className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Preview Column */}
            <motion.div
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="w-[380px] hidden xl:flex flex-col gap-4"
            >
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Preview</h3>
                    <div className="flex gap-2">
                        <select
                            className="bg-white border border-gray-200 rounded-md text-sm font-medium text-gray-600 outline-none p-1 cursor-pointer hover:bg-gray-50 transition"
                            onChange={(e) => setPreviewPlatform(e.target.value)}
                            value={previewPlatform}
                        >
                            <option value="instagram">Instagram</option>
                            <option value="linkedin">LinkedIn</option>
                            <option value="twitter">X / Twitter</option>
                        </select>
                    </div>
                </div>

                <div className="flex-1 bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden relative ring-4 ring-gray-50 flex flex-col">
                    <div className="h-full overflow-y-auto bg-white no-scrollbar">

                        {/* Instagram Preview */}
                        {previewPlatform === 'instagram' && (
                            <>
                                <div className="px-4 py-3 flex items-center gap-3 border-b border-gray-50">
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-yellow-400 to-purple-600 p-[2px]">
                                        <div className="w-full h-full bg-white rounded-full p-[2px]">
                                            <div className="w-full h-full bg-gray-200 rounded-full"></div>
                                        </div>
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-xs font-semibold text-gray-900">my_brand_official</p>
                                        <p className="text-[10px] text-gray-500">Sponsored</p>
                                    </div>
                                    <MoreHorizontal className="w-4 h-4 text-gray-400" />
                                </div>

                                <div className="aspect-square bg-gray-100 flex items-center justify-center text-gray-300 overflow-hidden">
                                    {media ? (
                                        <img
                                            src={`http://localhost:8000/${media.file_path.replace(/^\.?\//, '')}`}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <ImageIcon className="w-12 h-12 opacity-20" />
                                    )}
                                </div>

                                <div className="px-4 py-3">
                                    <div className="flex justify-between mb-3">
                                        <div className="flex gap-4">
                                            <div className="w-6 h-6 rounded-full border-2 border-gray-800/10"></div>
                                            <div className="w-6 h-6 rounded-full border-2 border-gray-800/10"></div>
                                            <div className="w-6 h-6 rounded-full border-2 border-gray-800/10"></div>
                                        </div>
                                        <div className="w-6 h-6 rounded-full border-2 border-gray-800/10"></div>
                                    </div>

                                    <div className="space-y-1">
                                        <p className="text-xs font-semibold text-gray-900">1,234 likes</p>
                                        <div className="text-xs text-gray-900">
                                            <span className="font-semibold mr-1">my_brand_official</span>
                                            {caption ? (
                                                <motion.span
                                                    initial={{ opacity: 0 }}
                                                    animate={{ opacity: 1 }}
                                                    key={caption}
                                                >
                                                    {caption}
                                                </motion.span>
                                            ) : (
                                                <span className="text-gray-400 italic">Your caption will appear here...</span>
                                            )}
                                        </div>
                                        <p className="text-[10px] text-gray-400 uppercase mt-2">2 HOURS AGO</p>
                                    </div>
                                </div>
                            </>
                        )}

                        {/* LinkedIn Preview */}
                        {previewPlatform === 'linkedin' && (
                            <div className="bg-[#F3F2EF] min-h-full pb-4">
                                <div className="bg-white mb-2 p-3 shadow-sm">
                                    <div className="flex gap-3 mb-2">
                                        <div className="w-10 h-10 bg-gray-200 rounded-sm"></div>
                                        <div>
                                            <p className="text-sm font-semibold text-gray-900">My Brand</p>
                                            <p className="text-xs text-gray-500">12,345 followers</p>
                                            <p className="text-xs text-gray-500">2h • <span className="text-gray-400">🌐</span></p>
                                        </div>
                                    </div>
                                    <div className="text-sm text-gray-900 mb-3 whitespace-pre-wrap">
                                        {caption || <span className="text-gray-400 italic">Your caption will appear here...</span>}
                                    </div>
                                    {media && (
                                        <div className="bg-gray-100 aspect-video rounded-none overflow-hidden border border-gray-100 mb-2">
                                            <img
                                                src={`http://localhost:8000/${media.file_path.replace(/^\.?\//, '')}`}
                                                className="w-full h-full object-cover"
                                            />
                                        </div>
                                    )}
                                    <div className="flex items-center justify-between text-gray-500 pt-2 border-t border-gray-100 mt-2">
                                        <div className="flex gap-1"><div className="w-4 h-4 bg-gray-200 rounded-full" /> <span className="text-xs">Like</span></div>
                                        <div className="flex gap-1"><div className="w-4 h-4 bg-gray-200 rounded-full" /> <span className="text-xs">Comment</span></div>
                                        <div className="flex gap-1"><div className="w-4 h-4 bg-gray-200 rounded-full" /> <span className="text-xs">Repost</span></div>
                                        <div className="flex gap-1"><div className="w-4 h-4 bg-gray-200 rounded-full" /> <span className="text-xs">Send</span></div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Twitter Preview */}
                        {previewPlatform === 'twitter' && (
                            <div className="p-4">
                                <div className="flex gap-3">
                                    <div className="w-10 h-10 bg-gray-200 rounded-full shrink-0"></div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1 mb-0.5">
                                            <span className="font-bold text-[15px] text-gray-900">My Brand</span>
                                            <span className="text-[15px] text-gray-500">@my_brand</span>
                                            <span className="text-[15px] text-gray-500">· 2h</span>
                                        </div>
                                        <div className="text-[15px] text-gray-900 mb-3 whitespace-pre-wrap">
                                            {caption || <span className="text-gray-400 italic">Your caption will appear here...</span>}
                                        </div>
                                        {media && (
                                            <div className="rounded-2xl border border-gray-200 overflow-hidden aspect-video mb-3">
                                                <img
                                                    src={`http://localhost:8000/${media.file_path.replace(/^\.?\//, '')}`}
                                                    className="w-full h-full object-cover"
                                                />
                                            </div>
                                        )}
                                        <div className="flex justify-between text-gray-500 max-w-md">
                                            <div className="w-4 h-4 bg-gray-200 rounded-full" />
                                            <div className="w-4 h-4 bg-gray-200 rounded-full" />
                                            <div className="w-4 h-4 bg-gray-200 rounded-full" />
                                            <div className="w-4 h-4 bg-gray-200 rounded-full" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                    </div>
                </div>
            </motion.div>

            {/* Asset Modal */}
            <AnimatePresence>
                {showAssetModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-6"
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.95, y: 20 }}
                            className="bg-white rounded-2xl w-full max-w-4xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden"
                        >
                            <div className="p-4 border-b flex items-center justify-between">
                                <h3 className="font-semibold text-lg">Select Asset</h3>
                                <button onClick={() => setShowAssetModal(false)}><X className="w-5 h-5 text-gray-500 hover:text-gray-900" /></button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    {assets.map(asset => (
                                        <div
                                            key={asset.id}
                                            onClick={() => { setMedia(asset); setShowAssetModal(false); }}
                                            className="aspect-square bg-gray-200 rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-blue-500 relative group"
                                        >
                                            <img
                                                src={`http://localhost:8000/${asset.file_path.replace(/^\.?\//, '')}`}
                                                className="w-full h-full object-cover"
                                            />
                                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                                        </div>
                                    ))}
                                </div>
                                {assets.length === 0 && <p className="text-center text-gray-500 py-10">No assets found. Go to Assets page to generate some!</p>}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <ScheduleModal
                isOpen={showScheduleModal}
                onClose={() => setShowScheduleModal(false)}
                onConfirm={handleScheduleConfirm}
            />

        </motion.div>
    );
}
