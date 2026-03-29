"use client"

import { useState, useEffect } from 'react';
import {
    Instagram, Linkedin, Twitter,
    Image as ImageIcon, Smile, Hash,
    Calendar, Send, ChevronDown, Check, MoreHorizontal, Loader2, X, Trash2, BookMarked, Megaphone, Palette, ArrowLeft, Image as ImageIcon2,
    Sparkles, PenLine, Save, Film, ChevronLeft, ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, LayoutGroup, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { connectorsApi, assetsApi, postsApi, aiApi, draftsApi, campaignsApi, type DraftMeta, type DraftFile, type CampaignMeta, type CampaignFile } from '@/lib/api';
import { ScheduleModal } from '@/components/schedule-modal';
import { ImageEditorModal } from '@/components/image-editor-modal';
import { useBulkJob } from '@/contexts/bulk-job-context';

const CHANNELS = [
    { id: 'instagram', name: 'Instagram', icon: Instagram, color: 'text-pink-600', active: true },
    { id: 'linkedin', name: 'LinkedIn', icon: Linkedin, color: 'text-blue-700', active: false },
    { id: 'twitter', name: 'X / Twitter', icon: Twitter, color: 'text-black', active: false },
];

interface Asset {
    id: number;
    file_path: string;
    prompt: string;
    brand_kit_id?: number | null;
}

interface BrandKit {
    id: number;
    name: string;
    description: string | null;
    logo_light_path: string | null;
    logo_dark_path: string | null;
    is_default: boolean;
    asset_count: number;
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
    const [postType, setPostType] = useState<'post' | 'carousel' | 'reel'>('post');
    const [additionalMedia, setAdditionalMedia] = useState<Asset[]>([]);
    const [closetPickerMode, setClosetPickerMode] = useState<'main' | 'carousel'>('main');
    const [previewSlideIndex, setPreviewSlideIndex] = useState(0);

    // Closet tab state
    const [closetTab, setClosetTab] = useState<'assets' | 'drafts' | 'campaigns' | 'brand_kits'>('assets');

    // Brand kits closet state
    const [brandKits, setBrandKits] = useState<BrandKit[]>([]);
    const [selectedBrandKit, setSelectedBrandKit] = useState<BrandKit | null>(null);
    const [brandKitAssets, setBrandKitAssets] = useState<Asset[]>([]);
    const [brandKitAssetsLoading, setBrandKitAssetsLoading] = useState(false);
    const [drafts, setDrafts] = useState<DraftMeta[]>([]);
    const [campaigns, setCampaigns] = useState<CampaignMeta[]>([]);
    const [selectedCampaign, setSelectedCampaign] = useState<CampaignFile | null>(null);
    const [isClosetLoading, setIsClosetLoading] = useState(false);
    const [isSavingDraft, setIsSavingDraft] = useState(false);

    // Editor State
    const [showImageEditor, setShowImageEditor] = useState(false);
    const [editorImageSrc, setEditorImageSrc] = useState<string>('');

    // ── AI Generate mode state ──────────────────────────────────────────────
    const { jobState, triggerBulkGenerate, clearJob } = useBulkJob();
    const [createMode, setCreateMode] = useState<'manual' | 'ai'>('manual');
    const [aiPrompt, setAiPrompt] = useState('');
    const [aiCount, setAiCount] = useState(3);
    const [aiBrandKitId, setAiBrandKitId] = useState<number | null>(null);
    const [selectedPrimaryIndex, setSelectedPrimaryIndex] = useState(0);
    const [isBatchSaving, setIsBatchSaving] = useState(false);
    const [aiBrandKits, setAiBrandKits] = useState<BrandKit[]>([]);
    
    // Derived preview state
    const allPreviewMedia = media ? (postType === 'carousel' ? [media, ...additionalMedia] : [media]) : [];
    // ───────────────────────────────────────────────────────────────────────

    useEffect(() => {
        if (allPreviewMedia.length > 0) {
            if (previewSlideIndex >= allPreviewMedia.length) {
                setPreviewSlideIndex(Math.max(0, allPreviewMedia.length - 1));
            }
        } else {
            setPreviewSlideIndex(0);
        }
    }, [allPreviewMedia.length, previewSlideIndex]);

    useEffect(() => {
        if (!media) {
            setPostType('post');
            setAdditionalMedia([]);
            return;
        }
        const isVideo = media.file_path?.match(/\.(mp4|mov|webm)$/i);
        if (isVideo) setPostType('reel');
        else setPostType('post');
    }, [media]);

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

        // Fetch brand kits for AI mode dropdown
        fetch('http://localhost:8000/api/brand-kits/')
            .then(r => r.json())
            .then((kits: BrandKit[]) => setAiBrandKits(kits))
            .catch(() => { /* silently fail */ });
    }, []);

    // Fetch drafts, campaigns & brand kits when closet opens
    const handleOpenCloset = (mode: 'main' | 'carousel' = 'main') => {
        setClosetPickerMode(mode);
        setShowAssetModal(true);
        setIsClosetLoading(true);
        Promise.all([
            draftsApi.list(),
            campaignsApi.list(),
            fetch('http://localhost:8000/api/brand-kits/').then(r => r.json()),
        ])
            .then(([draftData, campaignData, kitsData]) => {
                setDrafts(draftData);
                setCampaigns(campaignData);
                setBrandKits(kitsData);
            })
            .catch(err => toast.error('Failed to load closet data: ' + err.message))
            .finally(() => setIsClosetLoading(false));
    };

    const handleSelectBrandKit = async (kit: BrandKit) => {
        setSelectedBrandKit(kit);
        setBrandKitAssetsLoading(true);
        try {
            const res = await fetch(`http://localhost:8000/api/assets/?brand_kit_id=${kit.id}`);
            if (res.ok) setBrandKitAssets(await res.json());
        } catch (e) {
            toast.error('Failed to load kit assets');
        } finally {
            setBrandKitAssetsLoading(false);
        }
    };

    const handleSaveAsDraft = async () => {
        if (!caption && !media) {
            toast.error('Nothing to save – add a caption or media first.');
            return;
        }
        setIsSavingDraft(true);
        try {
            await draftsApi.create({
                caption,
                asset_ids: media ? [media.id] : [],
                platforms: selectedChannels,
                source: 'manual',
            });
            toast.success('Saved as draft template! View in Asset Closet → Drafts tab.');
        } catch (err: any) {
            toast.error(err.message || 'Failed to save draft');
        } finally {
            setIsSavingDraft(false);
        }
    };

    const handleDeleteDraft = async (draftId: string) => {
        try {
            await draftsApi.delete(draftId);
            setDrafts(prev => prev.filter(d => d.id !== draftId));
            toast.success('Draft deleted.');
        } catch (err: any) {
            toast.error(err.message || 'Failed to delete draft');
        }
    };

    const handleApplyDraft = async (draftId: string) => {
        try {
            const draft: DraftFile = await draftsApi.getById(draftId);
            setCaption(draft.caption);
            if (draft.asset_ids.length > 0) {
                const found = assets.find(a => a.id === draft.asset_ids[0]);
                if (found) setMedia(found);
            }
            if (draft.platforms.length > 0) setSelectedChannels(draft.platforms);
            setShowAssetModal(false);
            toast.success('Draft applied to composer.');
        } catch (err: any) {
            toast.error(err.message || 'Failed to apply draft');
        }
    };

    const handleLoadCampaign = async (campaignId: string) => {
        try {
            const campaign: CampaignFile = await campaignsApi.getById(campaignId);
            setSelectedCampaign(campaign);
        } catch (err: any) {
            toast.error(err.message || 'Failed to load campaign');
        }
    };

    const handleApplyBlueprint = (blueprint: { blueprint_id: string; caption: string; hashtags: string[]; platform: string; asset_id?: number | null }) => {
        const hashtagStr = blueprint.hashtags.join(' ');
        setCaption(blueprint.caption + (hashtagStr ? `\n\n${hashtagStr}` : ''));
        if (blueprint.asset_id) {
            const found = assets.find(a => a.id === blueprint.asset_id);
            if (found) setMedia(found);
        }
        setSelectedChannels([blueprint.platform]);
        setShowAssetModal(false);
        toast.success(`Blueprint applied from "${selectedCampaign?.title}"`);
    };


    const toggleChannel = (id: string) => {
        setSelectedChannels(prev =>
            prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
        );
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Directly upload for now, OR show editor immediately?
        // Let's stick to upload then edit flow for simplicity, OR allow editing before final confirm.
        // Current flow uses existing API which uploads immediately.
        // To support editing, we probably want to load into editor locally first or wait until user clicks "Edit"

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

    const handleEditClick = () => {
        if (!media) return;
        const src = `http://localhost:8000/${media.file_path.replace(/^\.?\//, '')}`;
        setEditorImageSrc(src);
        setShowImageEditor(true);
    };

    const handleEditorSave = async (newFile: File) => {
        // Upload the new edited file
        try {
            toast.loading("Uploading edited image...");
            const uploadedAsset = await assetsApi.upload(newFile);
            setMedia(uploadedAsset);
            toast.dismiss();
            toast.success('Image updated!');

            // Refresh assets list
            assetsApi.getAll()
                .then((data: any) => setAssets(data))
                .catch(err => console.error("Failed to fetch assets", err));
        } catch (error: any) {
            toast.dismiss();
            toast.error("Failed to save edited image");
            console.error(error);
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
                media_assets: media ? [media.id, ...additionalMedia.map(a => a.id)] : [],
                status: status === 'published' ? 'draft' : 'draft',
                channels: channelIds,
                platform_settings: { post_type: postType }
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
                media_assets: media ? [media.id, ...additionalMedia.map(a => a.id)] : [],
                status: 'draft',
                channels: channelIds,
                platform_settings: { post_type: postType }
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

    const handleBatchSave = async () => {
        if (!jobState.variations.length) return;
        setIsBatchSaving(true);
        try {
            const channelIds: number[] = [];
            const ig = backendChannels.find(c => c.platform === 'instagram');
            if (ig) channelIds.push(ig.id);

            await postsApi.batchCreate({
                variations: jobState.variations.map((v, i) => ({
                    asset_id: v.asset.id,
                    caption: v.caption,
                    is_primary: i === selectedPrimaryIndex,
                })),
                channels: channelIds,
                platforms: selectedChannels,
                brand_kit_id: aiBrandKitId,
                platform_settings: { post_type: postType }
            });
            toast.success('All variations saved as drafts!');
            clearJob();
        } catch (err: any) {
            toast.error(err.message || 'Failed to save drafts');
        } finally {
            setIsBatchSaving(false);
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
                {/* Mode Toggle + Channel Selector */}
                <div className="px-4 pt-4 pb-0 bg-gray-50/50 border-b border-gray-100">
                    <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit mb-3">
                        <button
                            onClick={() => setCreateMode('manual')}
                            className={cn(
                                'flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-all',
                                createMode === 'manual'
                                    ? 'bg-white shadow-sm text-gray-900 ring-1 ring-gray-200'
                                    : 'text-gray-500 hover:text-gray-700'
                            )}
                        >
                            <PenLine className="w-3.5 h-3.5" />
                            Manual
                        </button>
                        <button
                            onClick={() => {
                                setCreateMode('ai');
                                setAiPrompt('');
                                setSelectedPrimaryIndex(0);
                            }}
                            className={cn(
                                'flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-all',
                                createMode === 'ai'
                                    ? 'bg-white shadow-sm text-gray-900 ring-1 ring-gray-200'
                                    : 'text-gray-500 hover:text-gray-700'
                            )}
                        >
                            <Sparkles className="w-3.5 h-3.5" />
                            AI Generate
                        </button>
                    </div>

                    {/* Channel row — manual mode only */}
                    {createMode === 'manual' && (
                        <div className="flex items-center gap-3 pb-3">
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
                    )}
                </div>

                {/* Composer Body — Manual mode only */}
                {createMode === 'manual' && (
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

                                    {/* Overlay Actions */}
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100 gap-2">
                                        <button
                                            onClick={handleEditClick}
                                            className="bg-white/90 text-gray-800 px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-white flex items-center gap-2 shadow-sm transform hover:scale-105 transition"
                                        >
                                            <ImageIcon className="w-4 h-4" /> Edit
                                        </button>
                                        <button
                                            onClick={() => setMedia(null)}
                                            className="bg-white/90 text-red-600 px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-white flex items-center gap-2 shadow-sm transform hover:scale-105 transition"
                                        >
                                            <X className="w-4 h-4" /> Remove
                                        </button>
                                    </div>
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
                                            onClick={() => handleOpenCloset('main')}
                                            className="text-xs bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-md font-medium text-blue-700 hover:bg-blue-100 hover:scale-105 transition-transform"
                                        >
                                            Open Asset Closet
                                        </button>
                                    </div>
                                </motion.div>
                            )}
                        </motion.div>

                        {/* Post Type Selector */}
                        {media && (
                            <div className="pt-2">
                                <label className="text-sm font-semibold text-gray-700 mb-2 block">Post Type</label>
                                <div className="flex bg-gray-100 p-1 rounded-lg gap-1">
                                    <button
                                        onClick={() => setPostType('post')}
                                        className={cn(
                                            "flex-1 flex items-center justify-center gap-2 py-1.5 text-sm font-medium rounded-md transition-all",
                                            postType === 'post' ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
                                        )}
                                    >
                                        <ImageIcon2 className="w-4 h-4" /> Post
                                    </button>
                                    <button
                                        onClick={() => setPostType('carousel')}
                                        disabled={!!media.file_path?.match(/\.(mp4|mov|webm)$/i)}
                                        title={media.file_path?.match(/\.(mp4|mov|webm)$/i) ? "Carousel not available for video" : undefined}
                                        className={cn(
                                            "flex-1 flex items-center justify-center gap-2 py-1.5 text-sm font-medium rounded-md transition-all",
                                            postType === 'carousel' ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700",
                                            !!media.file_path?.match(/\.(mp4|mov|webm)$/i) && "opacity-50 cursor-not-allowed"
                                        )}
                                    >
                                        <MoreHorizontal className="w-4 h-4" /> Carousel
                                    </button>
                                    <button
                                        onClick={() => setPostType('reel')}
                                        disabled={!media.file_path?.match(/\.(mp4|mov|webm)$/i)}
                                        title={!media.file_path?.match(/\.(mp4|mov|webm)$/i) ? "Reel requires a video file" : undefined}
                                        className={cn(
                                            "flex-1 flex items-center justify-center gap-2 py-1.5 text-sm font-medium rounded-md transition-all",
                                            postType === 'reel' ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700",
                                            !media.file_path?.match(/\.(mp4|mov|webm)$/i) && "opacity-50 cursor-not-allowed"
                                        )}
                                    >
                                        <Film className="w-4 h-4" /> Reel
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Carousel tray */}
                        {media && postType === 'carousel' && (
                            <div className="pt-2">
                                <label className="text-sm font-semibold text-gray-700 mb-2 block">Carousel Items</label>
                                <div className="flex gap-3 overflow-x-auto pb-2 items-center">
                                    {/* Main media indicator */}
                                    <div className="relative w-24 h-24 shrink-0 rounded-lg overflow-hidden border-2 border-indigo-500 shadow-sm">
                                        <img src={`http://localhost:8000/${media.file_path.replace(/^\.?\//, '')}`} className="w-full h-full object-cover" />
                                        <div className="absolute bottom-0 left-0 right-0 bg-indigo-500 text-white text-[10px] text-center font-bold py-0.5">Slide 1</div>
                                    </div>

                                    {/* Additional media */}
                                    {additionalMedia.map((asset, idx) => (
                                        <div key={asset.id} className="relative w-24 h-24 shrink-0 rounded-lg overflow-hidden border border-gray-200 group shadow-sm">
                                            <img src={`http://localhost:8000/${asset.file_path.replace(/^\.?\//, '')}`} className="w-full h-full object-cover" />
                                            <button onClick={() => setAdditionalMedia(prev => prev.filter(a => a.id !== asset.id))} className="absolute top-1 right-1 bg-black/50 hover:bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-all z-10">
                                                <X className="w-3 h-3" />
                                            </button>
                                            <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] text-center font-bold py-0.5">Slide {idx + 2}</div>
                                        </div>
                                    ))}

                                    {/* Add button */}
                                    <button onClick={() => handleOpenCloset('carousel')} className="w-24 h-24 shrink-0 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 hover:text-indigo-500 hover:border-indigo-400 hover:bg-indigo-50 transition-colors">
                                        <span className="text-2xl font-light mb-1">+</span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                )}

                {/* AI Generate Mode body */}
                {createMode === 'ai' && (
                    <div className="flex-1 overflow-y-auto p-6 space-y-5">

                        {/* ── PROMPT INPUT (shown when idle or error) ── */}
                        {(jobState.status === 'idle' || jobState.status === 'error') && (
                            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                                <div className="space-y-1.5">
                                    <label className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                                        <Sparkles className="w-4 h-4 text-purple-500" />
                                        Describe your post
                                    </label>
                                    <textarea
                                        rows={3}
                                        className="w-full p-4 rounded-xl border border-gray-200 resize-none focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none text-base placeholder:text-gray-400 transition-shadow shadow-sm"
                                        placeholder="Describe the visual and mood of your post…"
                                        value={aiPrompt}
                                        onChange={(e) => setAiPrompt(e.target.value)}
                                    />
                                </div>

                                <div className="flex gap-3 flex-wrap">
                                    <div className="flex-1 min-w-[160px] space-y-1">
                                        <label className="text-xs font-medium text-gray-500">Brand Kit</label>
                                        <select
                                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white outline-none focus:ring-2 focus:ring-purple-400"
                                            value={aiBrandKitId ?? ''}
                                            onChange={(e) => setAiBrandKitId(e.target.value ? Number(e.target.value) : null)}
                                        >
                                            <option value="">No Brand Kit</option>
                                            {aiBrandKits.map(k => (
                                                <option key={k.id} value={k.id}>{k.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-medium text-gray-500">Variations</label>
                                        <select
                                            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white outline-none focus:ring-2 focus:ring-purple-400"
                                            value={aiCount}
                                            onChange={(e) => setAiCount(Number(e.target.value))}
                                        >
                                            {[2, 3, 4].map(n => (
                                                <option key={n} value={n}>{n}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {jobState.status === 'error' && (
                                    <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                                        ⚠️ {jobState.error}
                                    </p>
                                )}

                                <button
                                    disabled={!aiPrompt.trim()}
                                    onClick={() => {
                                        if (!aiPrompt.trim()) return;
                                        triggerBulkGenerate({ prompt: aiPrompt, brand_kit_id: aiBrandKitId, count: aiCount });
                                    }}
                                    className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl font-semibold text-sm hover:from-purple-700 hover:to-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm"
                                >
                                    <Sparkles className="w-4 h-4" />
                                    Generate Variations
                                </button>
                            </motion.div>
                        )}

                        {/* ── GENERATING STATE ── */}
                        {jobState.status === 'generating' && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                                <div className="text-center py-4 space-y-3">
                                    <Loader2 className="w-8 h-8 animate-spin text-purple-500 mx-auto" />
                                    <p className="text-sm font-medium text-gray-700">Generating {aiCount} variations…</p>
                                    <p className="text-xs text-gray-400">This takes ~20–30s. Feel free to navigate away — your results will be here when you return.</p>
                                </div>
                                <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                    <motion.div
                                        className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full"
                                        animate={{ x: ['-100%', '100%'] }}
                                        transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut' }}
                                    />
                                </div>
                            </motion.div>
                        )}

                        {/* ── VARIATION CARDS ── */}
                        {jobState.status === 'done' && jobState.variations.length > 0 && (
                            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Choose a variation</p>

                                {jobState.variations.map((variation, i) => {
                                    const isActive = media?.id === variation.asset.id;
                                    const thumbUrl = `http://localhost:8000/${variation.asset.file_path.replace(/^\.?\//, '')}`;
                                    return (
                                        <motion.div
                                            key={variation.asset.id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: i * 0.06 }}
                                            className={cn(
                                                'flex gap-4 p-4 rounded-xl border transition-all',
                                                isActive
                                                    ? 'border-purple-400 bg-purple-50 ring-1 ring-purple-300'
                                                    : 'border-gray-200 bg-white hover:border-purple-200'
                                            )}
                                        >
                                            <div className="w-20 h-20 shrink-0 rounded-lg overflow-hidden bg-gray-100">
                                                <img src={thumbUrl} alt={`Variation ${i + 1}`} className="w-full h-full object-cover" loading="lazy" />
                                            </div>
                                            <div className="flex-1 min-w-0 flex flex-col justify-between gap-2">
                                                <p className="text-sm text-gray-700 line-clamp-2">
                                                    {variation.caption.slice(0, 100)}{variation.caption.length > 100 ? '…' : ''}
                                                </p>
                                                <button
                                                    onClick={() => {
                                                        setCaption(variation.caption);
                                                        setMedia(variation.asset as unknown as Asset);
                                                        setSelectedPrimaryIndex(i);
                                                        setCreateMode('manual');
                                                    }}
                                                    className={cn(
                                                        'self-start text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors',
                                                        isActive
                                                            ? 'bg-purple-600 text-white hover:bg-purple-700'
                                                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                                    )}
                                                >
                                                    {isActive ? '✓ Selected' : 'Use This Variation'}
                                                </button>
                                            </div>
                                        </motion.div>
                                    );
                                })}

                                <button
                                    onClick={handleBatchSave}
                                    disabled={isBatchSaving}
                                    className="w-full py-2.5 border-2 border-dashed border-gray-300 text-gray-600 rounded-xl font-medium text-sm hover:border-purple-400 hover:text-purple-600 hover:bg-purple-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    <Save className="w-4 h-4" />
                                    {isBatchSaving ? 'Saving…' : '💾 Save All as Draft Posts'}
                                </button>

                                <button
                                    onClick={() => clearJob()}
                                    className="w-full text-center text-xs text-gray-400 hover:text-gray-700 transition-colors py-1"
                                >
                                    ← Generate new variations
                                </button>
                            </motion.div>
                        )}

                    </div>
                )}

                {/* Footer Actions — Manual mode only */}
                {createMode === 'manual' && (
                <div className="p-4 border-t border-gray-100 flex justify-between items-center bg-gray-50/30">
                    <div className="flex gap-2 items-center">
                        <button onClick={() => handlePost('draft')} disabled={isSubmitting} className="text-gray-500 text-sm font-medium hover:text-gray-900 px-2 transition-colors">
                            Save as Draft
                        </button>
                        <button
                            onClick={handleSaveAsDraft}
                            disabled={isSavingDraft}
                            className="flex items-center gap-1.5 text-xs text-indigo-600 border border-indigo-200 bg-indigo-50 px-3 py-1.5 rounded-md font-medium hover:bg-indigo-100 transition-colors disabled:opacity-60"
                            title="Save current caption + media as a reusable template in the Draft Library"
                        >
                            <BookMarked className="w-3.5 h-3.5" />
                            {isSavingDraft ? 'Saving…' : 'Save as Template'}
                        </button>
                    </div>
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
                )}
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

                                <div className="aspect-square bg-gray-100 flex items-center justify-center text-gray-300 overflow-hidden relative group">
                                    {allPreviewMedia.length > 0 ? (
                                        <>
                                            <img
                                                src={`http://localhost:8000/${allPreviewMedia[previewSlideIndex].file_path.replace(/^\.?\//, '')}`}
                                                className="w-full h-full object-cover"
                                            />
                                            {/* Navigation Arrows */}
                                            {allPreviewMedia.length > 1 && (
                                                <>
                                                    {previewSlideIndex > 0 && (
                                                        <button 
                                                            onClick={() => setPreviewSlideIndex(i => i - 1)}
                                                            className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white text-gray-800 p-1.5 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-all z-10"
                                                        >
                                                            <ChevronLeft className="w-5 h-5" />
                                                        </button>
                                                    )}
                                                    {previewSlideIndex < allPreviewMedia.length - 1 && (
                                                        <button 
                                                            onClick={() => setPreviewSlideIndex(i => i + 1)}
                                                            className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white text-gray-800 p-1.5 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-all z-10"
                                                        >
                                                            <ChevronRight className="w-5 h-5" />
                                                        </button>
                                                    )}
                                                    {/* Dots Indicator */}
                                                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1 z-10 bg-black/20 px-2 py-1 rounded-full backdrop-blur-sm">
                                                        {allPreviewMedia.map((_, idx) => (
                                                            <div key={idx} className={cn("w-1.5 h-1.5 rounded-full transition-colors", idx === previewSlideIndex ? "bg-blue-500" : "bg-white/60")} />
                                                        ))}
                                                    </div>
                                                </>
                                            )}
                                        </>
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
                                    {allPreviewMedia.length > 0 && (
                                        <div className="bg-gray-100 aspect-video rounded-none overflow-hidden border border-gray-100 mb-2 relative group">
                                            <img
                                                src={`http://localhost:8000/${allPreviewMedia[previewSlideIndex].file_path.replace(/^\.?\//, '')}`}
                                                className="w-full h-full object-cover"
                                            />
                                            {allPreviewMedia.length > 1 && (
                                                <>
                                                    {previewSlideIndex > 0 && (
                                                        <button onClick={() => setPreviewSlideIndex(i => i - 1)} className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white text-gray-800 p-1.5 rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-all z-10">
                                                            <ChevronLeft className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                    {previewSlideIndex < allPreviewMedia.length - 1 && (
                                                        <button onClick={() => setPreviewSlideIndex(i => i + 1)} className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white text-gray-800 p-1.5 rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-all z-10">
                                                            <ChevronRight className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                    <div className="absolute top-2 right-2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded-full backdrop-blur-sm z-10 font-medium">
                                                        {previewSlideIndex + 1} / {allPreviewMedia.length}
                                                    </div>
                                                </>
                                            )}
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
                                        {allPreviewMedia.length > 0 && (
                                            <div className="rounded-2xl border border-gray-200 overflow-hidden aspect-video mb-3 relative group">
                                                <img
                                                    src={`http://localhost:8000/${allPreviewMedia[previewSlideIndex].file_path.replace(/^\.?\//, '')}`}
                                                    className="w-full h-full object-cover"
                                                />
                                                {allPreviewMedia.length > 1 && (
                                                    <>
                                                        {previewSlideIndex > 0 && (
                                                            <button onClick={() => setPreviewSlideIndex(i => i - 1)} className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-1.5 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-all z-10">
                                                                <ChevronLeft className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                        {previewSlideIndex < allPreviewMedia.length - 1 && (
                                                            <button onClick={() => setPreviewSlideIndex(i => i + 1)} className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-1.5 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-all z-10">
                                                                <ChevronRight className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                    </>
                                                )}
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

            {/* Asset Closet Modal – 3 tabs */}
            <AnimatePresence>
                {showAssetModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-6"
                        onClick={(e) => { if (e.target === e.currentTarget) setShowAssetModal(false); }}
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.95, y: 20 }}
                            className="bg-white rounded-2xl w-full max-w-5xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
                        >
                            {/* Modal header */}
                            <div className="p-4 border-b flex items-center justify-between shrink-0">
                                <h3 className="font-semibold text-lg">Asset Closet</h3>
                                <button onClick={() => setShowAssetModal(false)}>
                                    <X className="w-5 h-5 text-gray-500 hover:text-gray-900" />
                                </button>
                            </div>

                            {/* Tabs */}
                            <div className="flex border-b shrink-0 bg-white text-sm px-4">
                                <button
                                    className={cn('px-4 py-2.5 font-medium border-b-2 transition-colors', closetTab === 'assets' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800')}
                                    onClick={() => setClosetTab('assets')}
                                >
                                    Generated Images
                                </button>
                                <button
                                    className={cn('px-4 py-2.5 font-medium border-b-2 transition-colors', closetTab === 'drafts' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800')}
                                    onClick={() => setClosetTab('drafts')}
                                >
                                    Drafts{drafts.length > 0 && <span className="ml-1.5 bg-indigo-100 text-indigo-700 text-xs font-semibold px-1.5 py-0.5 rounded-full">{drafts.length}</span>}
                                </button>
                                <button
                                    className={cn('px-4 py-2.5 font-medium border-b-2 transition-colors', closetTab === 'campaigns' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800')}
                                    onClick={() => { setClosetTab('campaigns'); setSelectedCampaign(null); }}
                                >
                                    Campaigns{campaigns.length > 0 && <span className="ml-1.5 bg-purple-100 text-purple-700 text-xs font-semibold px-1.5 py-0.5 rounded-full">{campaigns.length}</span>}
                                </button>
                                <button
                                    className={cn('px-4 py-2.5 font-medium border-b-2 transition-colors', closetTab === 'brand_kits' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-800')}
                                    onClick={() => { setClosetTab('brand_kits'); setSelectedBrandKit(null); setBrandKitAssets([]); }}
                                >
                                    Brand Kits{brandKits.length > 0 && <span className="ml-1.5 bg-indigo-100 text-indigo-700 text-xs font-semibold px-1.5 py-0.5 rounded-full">{brandKits.length}</span>}
                                </button>
                            </div>

                            {/* Tab body — min-h-0 lets children own their own scroll within the flex-col modal */}
                            <div className="flex-1 min-h-0 flex flex-col">

                                {/* ── ASSETS TAB ────────────────────────────── */}
                                {closetTab === 'assets' && (
                                    <div className="flex-1 min-h-0 overflow-y-auto p-6 bg-gray-50">
                                        {assets.length === 0 ? (
                                            <p className="text-center text-gray-500 py-16">No assets yet. Head to the Assets page to generate some!</p>
                                        ) : (
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                {assets.map(asset => (
                                                    <div
                                                        key={asset.id}
                                                        onClick={() => {
                                                            if (closetPickerMode === 'carousel') {
                                                                if (!additionalMedia.find(a => a.id === asset.id) && media?.id !== asset.id) {
                                                                    setAdditionalMedia(prev => [...prev, asset]);
                                                                }
                                                            } else {
                                                                setMedia(asset);
                                                                setAdditionalMedia([]);
                                                            }
                                                            setShowAssetModal(false);
                                                        }}
                                                        className="aspect-square bg-gray-200 rounded-xl overflow-hidden cursor-pointer hover:ring-2 hover:ring-blue-500 relative group"
                                                    >
                                                        <img
                                                            src={`http://localhost:8000/${asset.file_path.replace(/^\.?\//, '')}`}
                                                            className="w-full h-full object-cover"
                                                            alt="asset"
                                                        />
                                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-end p-2 opacity-0 group-hover:opacity-100">
                                                            <span className="text-white text-xs bg-black/60 rounded px-2 py-0.5">Use this</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* ── DRAFTS TAB ────────────────────────────── */}
                                {closetTab === 'drafts' && (
                                    <div className="flex-1 min-h-0 overflow-y-auto p-6 bg-gray-50">
                                        {isClosetLoading ? (
                                            <div className="flex items-center justify-center py-20">
                                                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                                            </div>
                                        ) : drafts.length === 0 ? (
                                            <div className="text-center py-16">
                                                <BookMarked className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                                                <p className="text-gray-500 font-medium">No draft templates yet.</p>
                                                <p className="text-gray-400 text-sm mt-1">Use <strong>Save as Template</strong> in the composer to create one.</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                {drafts.map(draft => (
                                                    <div key={draft.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-4 hover:border-blue-200 transition-colors group">
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-sm text-gray-900 line-clamp-2">{draft.caption}</p>
                                                            <div className="flex items-center gap-3 mt-2">
                                                                <span className="text-xs text-gray-400">{draft.asset_count} asset{draft.asset_count !== 1 ? 's' : ''}</span>
                                                                {draft.platforms.map(p => (
                                                                    <span key={p} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full capitalize">{p}</span>
                                                                ))}
                                                                <span className="text-xs text-gray-400">{new Date(draft.created_at).toLocaleDateString()}</span>
                                                            </div>
                                                        </div>
                                                        <div className="flex gap-2 shrink-0">
                                                            <button
                                                                onClick={() => handleApplyDraft(draft.id)}
                                                                className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-blue-700 transition-colors"
                                                            >
                                                                Apply
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteDraft(draft.id)}
                                                                className="text-xs text-red-500 hover:text-red-700 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                                                                title="Delete draft"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* ── CAMPAIGNS TAB ─────────────────────────── */}
                                {closetTab === 'campaigns' && (
                                    <div className="flex-1 min-h-0 flex">
                                        {/* Left: campaign list */}
                                        <div className="w-72 shrink-0 border-r overflow-y-auto bg-gray-50 p-3 space-y-2">
                                            {isClosetLoading ? (
                                                <div className="flex items-center justify-center py-20">
                                                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                                                </div>
                                            ) : campaigns.length === 0 ? (
                                                <div className="text-center py-12 px-4">
                                                    <Megaphone className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                                                    <p className="text-gray-500 text-sm font-medium">No campaigns yet.</p>
                                                    <p className="text-gray-400 text-xs mt-1">Generate one from the Campaigns page.</p>
                                                </div>
                                            ) : campaigns.map(c => (
                                                <button
                                                    key={c.id}
                                                    onClick={() => handleLoadCampaign(c.id)}
                                                    className={cn(
                                                        'w-full text-left p-3 rounded-xl border transition-all group',
                                                        selectedCampaign?.id === c.id
                                                            ? 'border-purple-400 bg-purple-50 ring-1 ring-purple-300'
                                                            : 'border-gray-200 bg-white hover:border-purple-200 hover:bg-purple-50/40'
                                                    )}
                                                >
                                                    <p className={cn('text-sm font-semibold truncate', selectedCampaign?.id === c.id ? 'text-purple-900' : 'text-gray-800')}>{c.title}</p>
                                                    <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{c.strategy}</p>
                                                    <div className="flex items-center gap-2 mt-2">
                                                        <span className="text-xs text-gray-400">{c.post_count} post{c.post_count !== 1 ? 's' : ''}</span>
                                                        {c.platforms.slice(0, 3).map(p => (
                                                            <span key={p} className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full capitalize">{p}</span>
                                                        ))}
                                                    </div>
                                                </button>
                                            ))}
                                        </div>

                                        {/* Right: selected campaign's blueprints */}
                                        <div className="flex-1 min-h-0 overflow-y-auto p-5">
                                            {!selectedCampaign ? (
                                                <div className="flex flex-col items-center justify-center h-full text-center">
                                                    <Megaphone className="w-10 h-10 text-gray-200 mb-3" />
                                                    <p className="text-gray-400">Select a campaign to view its posts</p>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="mb-4">
                                                        <h4 className="font-semibold text-gray-900">{selectedCampaign.title}</h4>
                                                        <p className="text-sm text-gray-500 mt-1">{selectedCampaign.strategy}</p>
                                                    </div>
                                                    <div className="space-y-3">
                                                        {selectedCampaign.posts.map(bp => (
                                                            <div key={bp.blueprint_id} className="bg-white border border-gray-200 rounded-xl p-4 hover:border-purple-200 transition-colors">
                                                                <div className="flex items-start justify-between gap-3">
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="flex items-center gap-2 mb-2">
                                                                            <span className={cn(
                                                                                'text-xs font-semibold px-2 py-0.5 rounded-full capitalize',
                                                                                bp.platform === 'instagram' ? 'bg-pink-100 text-pink-700' :
                                                                                bp.platform === 'linkedin' ? 'bg-blue-100 text-blue-700' :
                                                                                'bg-gray-100 text-gray-700'
                                                                            )}>
                                                                                {bp.platform}
                                                                            </span>
                                                                            {bp.status === 'committed' && (
                                                                                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">Committed</span>
                                                                            )}
                                                                        </div>
                                                                        <p className="text-sm text-gray-800 line-clamp-3">{bp.caption}</p>
                                                                        {bp.hashtags.length > 0 && (
                                                                            <p className="text-xs text-blue-500 mt-1.5 line-clamp-1">{bp.hashtags.join(' ')}</p>
                                                                        )}
                                                                        {bp.image_prompt && !bp.asset_id && (
                                                                            <p className="text-xs text-orange-500 mt-1">📸 Image idea: {bp.image_prompt}</p>
                                                                        )}
                                                                    </div>
                                                                    <button
                                                                        onClick={() => handleApplyBlueprint(bp)}
                                                                        disabled={bp.status === 'committed'}
                                                                        className="shrink-0 text-xs bg-purple-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-purple-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                                                    >
                                                                        Use in Composer
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* ── BRAND KITS TAB ──────────────────────────── */}
                                {closetTab === 'brand_kits' && (
                                    <div className="flex-1 min-h-0 overflow-y-auto p-6 bg-gray-50">
                                        {/* Kit grid view */}
                                        {!selectedBrandKit ? (
                                            isClosetLoading ? (
                                                <div className="flex items-center justify-center py-20">
                                                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                                                </div>
                                            ) : brandKits.length === 0 ? (
                                                <div className="text-center py-16">
                                                    <Palette className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                                                    <p className="text-gray-500 font-medium">No brand kits yet.</p>
                                                    <p className="text-gray-400 text-sm mt-1">Create one in Settings → Brand tab.</p>
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                                    {brandKits.map(kit => (
                                                        <button
                                                            key={kit.id}
                                                            onClick={() => handleSelectBrandKit(kit)}
                                                            className="group bg-white border border-gray-200 rounded-xl p-5 text-left hover:border-indigo-300 hover:shadow-md transition-all"
                                                        >
                                                            {/* Logo thumbnail or icon */}
                                                            <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center mb-3 overflow-hidden">
                                                                {kit.logo_light_path ? (
                                                                    <img
                                                                        src={`http://localhost:8000/${kit.logo_light_path.replace(/^\.?\//, '')}`}
                                                                        alt={kit.name}
                                                                        className="w-full h-full object-contain p-1"
                                                                    />
                                                                ) : (
                                                                    <Palette className="w-6 h-6 text-indigo-400" />
                                                                )}
                                                            </div>
                                                            <p className="font-semibold text-gray-900 group-hover:text-indigo-700 transition-colors">{kit.name}</p>
                                                            {kit.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{kit.description}</p>}
                                                            <div className="flex items-center gap-2 mt-3">
                                                                <span className="text-xs text-gray-400">{kit.asset_count} asset{kit.asset_count !== 1 ? 's' : ''}</span>
                                                                {kit.is_default && <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-semibold">DEFAULT</span>}
                                                            </div>
                                                        </button>
                                                    ))}
                                                </div>
                                            )
                                        ) : (
                                            /* Asset gallery for selected kit */
                                            <div className="space-y-4">
                                                <div className="flex items-center gap-3">
                                                    <button
                                                        onClick={() => { setSelectedBrandKit(null); setBrandKitAssets([]); }}
                                                        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 font-medium transition-colors"
                                                    >
                                                        <ArrowLeft className="w-4 h-4" />
                                                        Back to Kits
                                                    </button>
                                                    <span className="text-gray-300">·</span>
                                                    <div className="flex items-center gap-1.5">
                                                        <Palette className="w-4 h-4 text-indigo-500" />
                                                        <span className="text-sm font-semibold text-gray-900">{selectedBrandKit.name}</span>
                                                    </div>
                                                </div>
                                                {brandKitAssetsLoading ? (
                                                    <div className="flex items-center justify-center py-20">
                                                        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                                                    </div>
                                                ) : brandKitAssets.length === 0 ? (
                                                    <div className="text-center py-16">
                                                        <ImageIcon2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                                                        <p className="text-gray-500 font-medium">No assets for this kit yet.</p>
                                                        <p className="text-gray-400 text-sm mt-1">Generate images with this kit selected on the Assets page.</p>
                                                    </div>
                                                ) : (
                                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                        {brandKitAssets.map(asset => (
                                                            <div
                                                                key={asset.id}
                                                                onClick={() => {
                                                                    if (closetPickerMode === 'carousel') {
                                                                        if (!additionalMedia.find(a => a.id === asset.id) && media?.id !== asset.id) {
                                                                            setAdditionalMedia(prev => [...prev, asset]);
                                                                        }
                                                                    } else {
                                                                        setMedia(asset);
                                                                        setAdditionalMedia([]);
                                                                    }
                                                                    setShowAssetModal(false);
                                                                }}
                                                                className="relative aspect-square bg-gray-200 rounded-xl overflow-hidden cursor-pointer hover:ring-2 hover:ring-indigo-500 group"
                                                            >
                                                                <img
                                                                    src={`http://localhost:8000/${asset.file_path.replace(/^\.?\//, '')}`}
                                                                    className="w-full h-full object-cover"
                                                                    alt="asset"
                                                                />
                                                                {/* Kit badge */}
                                                                <div className="absolute top-1.5 left-1.5">
                                                                    <span className="text-[9px] bg-indigo-600/90 text-white px-1.5 py-0.5 rounded-full font-semibold backdrop-blur-sm">
                                                                        {selectedBrandKit.name}
                                                                    </span>
                                                                </div>
                                                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-end p-2 opacity-0 group-hover:opacity-100">
                                                                    <span className="text-white text-xs bg-black/60 rounded px-2 py-0.5">Use this</span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}

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

            <ImageEditorModal
                isOpen={showImageEditor}
                onClose={() => setShowImageEditor(false)}
                imageSrc={editorImageSrc}
                onSave={handleEditorSave}
            />

        </motion.div>
    );
}
