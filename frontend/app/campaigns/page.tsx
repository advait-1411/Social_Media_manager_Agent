"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Instagram,
    Linkedin,
    Twitter,
    Sparkles,
    ChevronRight,
    CheckSquare,
    Square,
    Loader2,
    Send,
    Calendar,
    Image as ImageIcon,
    Hash,
    Lightbulb,
    Target,
    Wand2,
    ArrowRight,
    RefreshCw,
    X,
    Check,
    Clock,
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
    assetsApi,
    campaignsApi,
    CampaignBlueprint,
    PostBlueprint,
    CampaignGenerationRequest,
} from "@/lib/api";
import { cn } from "@/lib/utils";

// ─── Platform helpers ────────────────────────────────────────────────────────
const PLATFORM_META: Record<
    string,
    { label: string; Icon: React.ComponentType<{ className?: string }>; color: string; bg: string }
> = {
    instagram: { label: "Instagram", Icon: Instagram, color: "text-pink-600", bg: "bg-pink-50 border-pink-200" },
    linkedin: { label: "LinkedIn", Icon: Linkedin, color: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
    twitter: { label: "X / Twitter", Icon: Twitter, color: "text-gray-800", bg: "bg-gray-50 border-gray-200" },
};

function PlatformBadge({ platform }: { platform: string }) {
    const meta = PLATFORM_META[platform] ?? {
        label: platform,
        Icon: Hash,
        color: "text-gray-600",
        bg: "bg-gray-50 border-gray-200",
    };
    return (
        <span
            className={cn(
                "inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border",
                meta.bg,
                meta.color
            )}
        >
            <meta.Icon className="w-3 h-3" />
            {meta.label}
        </span>
    );
}

// ─── Asset interface ──────────────────────────────────────────────────────────
interface Asset {
    id: number;
    file_path: string;
    prompt?: string;
    asset_type?: string;
}

// ─── Post card ────────────────────────────────────────────────────────────────
interface PostCardProps {
    post: PostBlueprint;
    selected: boolean;
    onToggle: () => void;
    onCaptionChange: (val: string) => void;
    assets: Asset[];
}

function PostCard({ post, selected, onToggle, onCaptionChange, assets }: PostCardProps) {
    const attachedAsset = assets.find((a) => a.id === post.asset_id);

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
                "rounded-xl border transition-all duration-200 overflow-hidden",
                selected
                    ? "border-violet-400 shadow-lg shadow-violet-100 bg-white ring-1 ring-violet-300"
                    : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
            )}
        >
            {/* Card header */}
            <div
                className={cn(
                    "flex items-center justify-between px-4 py-2.5 border-b",
                    selected ? "bg-violet-50 border-violet-200" : "bg-gray-50 border-gray-100"
                )}
            >
                <div className="flex items-center gap-2">
                    <button
                        onClick={onToggle}
                        className={cn(
                            "transition-colors rounded",
                            selected ? "text-violet-600 hover:text-violet-700" : "text-gray-400 hover:text-gray-600"
                        )}
                        title={selected ? "Deselect post" : "Select post"}
                    >
                        {selected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                    </button>
                    <PlatformBadge platform={post.platform} />
                </div>
                {post.asset_id && (
                    <span className="text-xs text-gray-400 font-medium">Asset #{post.asset_id}</span>
                )}
            </div>

            {/* Asset thumbnail */}
            {attachedAsset && (
                <div className="border-b border-gray-100 bg-gray-50 flex items-center justify-center overflow-hidden h-24">
                    <img
                        src={`http://localhost:8000/${attachedAsset.file_path.replace(/^\.?\//, "")}`}
                        alt="Post asset"
                        className="h-full w-full object-cover"
                    />
                </div>
            )}

            {/* Image prompt hint */}
            {post.image_prompt && !attachedAsset && (
                <div className="px-4 py-2 flex items-start gap-2 bg-amber-50 border-b border-amber-100">
                    <ImageIcon className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-700 leading-relaxed line-clamp-2">{post.image_prompt}</p>
                </div>
            )}

            {/* Caption editor */}
            <div className="px-4 py-3">
                <textarea
                    value={post.caption}
                    onChange={(e) => onCaptionChange(e.target.value)}
                    rows={3}
                    className="w-full text-sm text-gray-800 leading-relaxed resize-none border-0 outline-none bg-transparent placeholder:text-gray-400 focus:ring-0 p-0"
                    placeholder="Caption…"
                />
            </div>

            {/* Hashtags */}
            {post.hashtags.length > 0 && (
                <div className="px-4 pb-3 flex flex-wrap gap-1">
                    {post.hashtags.slice(0, 8).map((tag) => (
                        <span key={tag} className="text-xs text-violet-600 font-medium">
                            {tag}
                        </span>
                    ))}
                    {post.hashtags.length > 8 && (
                        <span className="text-xs text-gray-400">+{post.hashtags.length - 8} more</span>
                    )}
                </div>
            )}
        </motion.div>
    );
}

// ─── Campaign column ──────────────────────────────────────────────────────────
interface CampaignColumnProps {
    campaign: CampaignBlueprint;
    selectedPostIds: Set<string>;
    onTogglePost: (postId: string) => void;
    onToggleAll: () => void;
    onCaptionChange: (postId: string, val: string) => void;
    onCommit: () => void;
    isCommitting: boolean;
    assets: Asset[];
}

function CampaignColumn({
    campaign,
    selectedPostIds,
    onTogglePost,
    onToggleAll,
    onCaptionChange,
    onCommit,
    isCommitting,
    assets,
}: CampaignColumnProps) {
    const allSelected = campaign.posts.every((p) => selectedPostIds.has(p.blueprint_id));
    const someSelected = campaign.posts.some((p) => selectedPostIds.has(p.blueprint_id));
    const selectedCount = campaign.posts.filter((p) => selectedPostIds.has(p.blueprint_id)).length;

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex flex-col min-w-[340px] max-w-[380px] flex-shrink-0 bg-gray-50 rounded-2xl border border-gray-200 overflow-hidden"
        >
            {/* Column header */}
            <div className="p-4 bg-white border-b border-gray-200">
                <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-semibold text-gray-900 text-sm leading-tight">{campaign.title}</h3>
                    <div className="flex flex-wrap gap-1 shrink-0">
                        {campaign.platforms.map((p) => (
                            <PlatformBadge key={p} platform={p} />
                        ))}
                    </div>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed line-clamp-2 mb-3">{campaign.strategy}</p>

                {campaign.schedule_hint && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-3">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{campaign.schedule_hint}</span>
                    </div>
                )}

                {/* Select all / commit actions */}
                <div className="flex items-center justify-between">
                    <button
                        onClick={onToggleAll}
                        className="flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-violet-600 transition-colors"
                    >
                        {allSelected ? (
                            <CheckSquare className="w-3.5 h-3.5" />
                        ) : (
                            <Square className="w-3.5 h-3.5" />
                        )}
                        {allSelected ? "Deselect all" : "Select all"}
                    </button>

                    {someSelected && (
                        <motion.button
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            onClick={onCommit}
                            disabled={isCommitting}
                            className="flex items-center gap-1.5 text-xs font-semibold bg-violet-600 hover:bg-violet-700 text-white px-3 py-1.5 rounded-lg transition-all shadow-sm disabled:opacity-60"
                        >
                            {isCommitting ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                                <Send className="w-3.5 h-3.5" />
                            )}
                            Commit {selectedCount} post{selectedCount !== 1 ? "s" : ""}
                        </motion.button>
                    )}
                </div>
            </div>

            {/* Post cards */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {campaign.posts.map((post) => (
                    <PostCard
                        key={post.blueprint_id}
                        post={post}
                        selected={selectedPostIds.has(post.blueprint_id)}
                        onToggle={() => onTogglePost(post.blueprint_id)}
                        onCaptionChange={(val) => onCaptionChange(post.blueprint_id, val)}
                        assets={assets}
                    />
                ))}
            </div>
        </motion.div>
    );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function CampaignsPage() {
    const router = useRouter();

    // Form state
    const [prompt, setPrompt] = useState("");
    const [businessContext, setBusinessContext] = useState("");
    const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(["instagram"]);
    const [tone, setTone] = useState("");
    const [legalFooter, setLegalFooter] = useState("");
    const [numCampaigns, setNumCampaigns] = useState(3);
    const [postsPerCampaign, setPostsPerCampaign] = useState(5);

    // Asset selector state
    const [assets, setAssets] = useState<Asset[]>([]);
    const [selectedAssetIds, setSelectedAssetIds] = useState<number[]>([]);
    const [showAssetPicker, setShowAssetPicker] = useState(false);

    // Generation state
    const [isGenerating, setIsGenerating] = useState(false);
    const [campaigns, setCampaigns] = useState<CampaignBlueprint[]>([]);

    // Selection & commit state (per campaign)
    // selectedPosts: campaignId → Set<postId>
    const [selectedPosts, setSelectedPosts] = useState<Record<string, Set<string>>>({});
    const [committingCampaignId, setCommittingCampaignId] = useState<string | null>(null);

    // Load assets on mount
    useEffect(() => {
        assetsApi
            .getAll()
            .then((data: unknown) => setAssets(data as Asset[]))
            .catch(() => toast.error("Failed to load assets"));
    }, []);

    // ── Platform toggle ──────────────────────────────────────────────────────
    const togglePlatform = (p: string) => {
        setSelectedPlatforms((prev) =>
            prev.includes(p) ? (prev.length > 1 ? prev.filter((x) => x !== p) : prev) : [...prev, p]
        );
    };

    // ── Asset toggle ─────────────────────────────────────────────────────────
    const toggleAsset = (id: number) => {
        setSelectedAssetIds((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        );
    };

    // ── Generate ─────────────────────────────────────────────────────────────
    const handleGenerate = async () => {
        if (!prompt.trim()) {
            toast.error("Please enter a campaign idea.");
            return;
        }
        if (selectedPlatforms.length === 0) {
            toast.error("Select at least one platform.");
            return;
        }

        setIsGenerating(true);
        setCampaigns([]);
        setSelectedPosts({});

        try {
            const payload: CampaignGenerationRequest = {
                prompt: prompt.trim(),
                business_context: businessContext.trim() || undefined,
                asset_ids: selectedAssetIds,
                platforms: selectedPlatforms,
                num_campaigns: numCampaigns,
                posts_per_campaign: postsPerCampaign,
                guidelines:
                    tone || legalFooter
                        ? { tone: tone || undefined, legal_footer: legalFooter || undefined }
                        : undefined,
            };

            const result = await campaignsApi.generate(payload);
            setCampaigns(result.campaigns);

            // Auto-select all posts for each campaign
            const initialSelection: Record<string, Set<string>> = {};
            result.campaigns.forEach((c) => {
                initialSelection[c.id] = new Set(c.posts.map((p) => p.blueprint_id));
            });
            setSelectedPosts(initialSelection);

            toast.success(`Generated ${result.campaigns.length} campaign concept${result.campaigns.length !== 1 ? "s" : ""}! ✨`);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed to generate campaigns";
            toast.error(msg);
        } finally {
            setIsGenerating(false);
        }
    };

    // ── Caption update (live editing) ───────────────────────────────────────
    const handleCaptionChange = useCallback(
        (campaignId: string, postId: string, val: string) => {
            setCampaigns((prev) =>
                prev.map((c) =>
                    c.id === campaignId
                        ? {
                            ...c,
                            posts: c.posts.map((p) =>
                                p.blueprint_id === postId ? { ...p, caption: val } : p
                            ),
                        }
                        : c
                )
            );
        },
        []
    );

    // ── Selection helpers ────────────────────────────────────────────────────
    const togglePost = (campaignId: string, postId: string) => {
        setSelectedPosts((prev) => {
            const s = new Set(prev[campaignId] ?? []);
            s.has(postId) ? s.delete(postId) : s.add(postId);
            return { ...prev, [campaignId]: s };
        });
    };

    const toggleAllForCampaign = (campaign: CampaignBlueprint) => {
        setSelectedPosts((prev) => {
            const allIds = campaign.posts.map((p) => p.blueprint_id);
            const current = prev[campaign.id] ?? new Set<string>();
            const allSelected = allIds.every((id) => current.has(id));
            return {
                ...prev,
                [campaign.id]: allSelected ? new Set<string>() : new Set(allIds),
            };
        });
    };

    // ── Commit ───────────────────────────────────────────────────────────────
    const handleCommit = async (campaign: CampaignBlueprint) => {
        const postIds = selectedPosts[campaign.id] ?? new Set<string>();
        const postsToCommit = campaign.posts.filter((p) => postIds.has(p.blueprint_id));

        if (postsToCommit.length === 0) {
            toast.error("Select at least one post to commit.");
            return;
        }

        const blueprintIds = postsToCommit.map((p) => p.blueprint_id);

        setCommittingCampaignId(campaign.id);
        try {
            const result = await campaignsApi.commit(
                campaign.id,
                {
                    blueprint_ids: blueprintIds,
                    default_status: "draft",
                },
            );

            const count = result.created_post_ids.length;
            toast.success(`Created ${count} draft post${count !== 1 ? "s" : ""}! 🎉`, {
                action: {
                    label: "Go to Publish",
                    onClick: () => router.push("/publish"),
                },
                duration: 6000,
            });
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Commit failed";
            toast.error(msg);
        } finally {
            setCommittingCampaignId(null);
        }
    };

    // ────────────────────────────────────────────────────────────────────────
    return (
        <div className="flex h-[calc(100vh-140px)] gap-6 overflow-hidden">

            {/* ── LEFT PANEL: Brief Form ── */}
            <motion.aside
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="w-80 flex-shrink-0 bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col overflow-hidden"
            >
                {/* Header */}
                <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-violet-50 to-purple-50">
                    <div className="flex items-center gap-2 mb-1">
                        <div className="w-7 h-7 bg-violet-600 rounded-lg flex items-center justify-center">
                            <Wand2 className="w-4 h-4 text-white" />
                        </div>
                        <h2 className="font-semibold text-gray-900">Campaign Brief</h2>
                    </div>
                    <p className="text-xs text-gray-500">Fill in the details and let AI craft your content strategy.</p>
                </div>

                {/* Form body */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

                    {/* Campaign idea */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-violet-500" />
                            Campaign Idea <span className="text-red-500">*</span>
                        </label>
                        <textarea
                            rows={3}
                            placeholder='e.g. "Back to School sale for ergonomic chairs"'
                            className="w-full text-sm border border-gray-200 rounded-xl p-3 resize-none focus:ring-2 focus:ring-violet-400 focus:border-transparent outline-none placeholder:text-gray-400"
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                        />
                    </div>

                    {/* Business context */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                            <Target className="w-3.5 h-3.5 text-blue-500" />
                            Business Context
                        </label>
                        <textarea
                            rows={2}
                            placeholder="Brand niche, target audience, key products…"
                            className="w-full text-sm border border-gray-200 rounded-xl p-3 resize-none focus:ring-2 focus:ring-violet-400 focus:border-transparent outline-none placeholder:text-gray-400"
                            value={businessContext}
                            onChange={(e) => setBusinessContext(e.target.value)}
                        />
                    </div>

                    {/* Platforms */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-gray-700">Platforms</label>
                        <div className="flex gap-2 flex-wrap">
                            {Object.entries(PLATFORM_META).map(([id, meta]) => {
                                const active = selectedPlatforms.includes(id);
                                return (
                                    <button
                                        key={id}
                                        onClick={() => togglePlatform(id)}
                                        className={cn(
                                            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                                            active
                                                ? "bg-violet-600 text-white border-violet-600 shadow-sm"
                                                : "bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                                        )}
                                    >
                                        <meta.Icon className="w-3.5 h-3.5" />
                                        {meta.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Asset selector */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                            <ImageIcon className="w-3.5 h-3.5 text-amber-500" />
                            Brand Assets
                        </label>
                        <button
                            onClick={() => setShowAssetPicker(true)}
                            className="w-full flex items-center justify-between text-sm border border-dashed border-gray-300 rounded-xl px-3 py-2.5 text-left hover:border-violet-400 hover:bg-violet-50 transition-colors"
                        >
                            <span className={selectedAssetIds.length ? "text-gray-800 font-medium" : "text-gray-400"}>
                                {selectedAssetIds.length
                                    ? `${selectedAssetIds.length} asset${selectedAssetIds.length !== 1 ? "s" : ""} selected`
                                    : "Select assets…"}
                            </span>
                            <ChevronRight className="w-4 h-4 text-gray-400" />
                        </button>
                    </div>

                    {/* Tone */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                            <Lightbulb className="w-3.5 h-3.5 text-yellow-500" />
                            Tone of Voice
                        </label>
                        <input
                            type="text"
                            placeholder="e.g. energetic, professional, playful"
                            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:ring-2 focus:ring-violet-400 focus:border-transparent outline-none placeholder:text-gray-400"
                            value={tone}
                            onChange={(e) => setTone(e.target.value)}
                        />
                    </div>

                    {/* Legal footer */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-gray-700">Legal Footer</label>
                        <input
                            type="text"
                            placeholder="Optional disclaimer appended to captions"
                            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:ring-2 focus:ring-violet-400 focus:border-transparent outline-none placeholder:text-gray-400"
                            value={legalFooter}
                            onChange={(e) => setLegalFooter(e.target.value)}
                        />
                    </div>

                    {/* Volume controls */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-gray-700">Campaigns</label>
                            <select
                                value={numCampaigns}
                                onChange={(e) => setNumCampaigns(Number(e.target.value))}
                                className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-violet-400 bg-white"
                            >
                                {[1, 2, 3, 4, 5].map((n) => (
                                    <option key={n} value={n}>{n}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-gray-700">Posts each</label>
                            <select
                                value={postsPerCampaign}
                                onChange={(e) => setPostsPerCampaign(Number(e.target.value))}
                                className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-violet-400 bg-white"
                            >
                                {[3, 4, 5, 6, 7, 8].map((n) => (
                                    <option key={n} value={n}>{n}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                {/* Generate button */}
                <div className="px-5 py-4 border-t border-gray-100">
                    <motion.button
                        whileTap={{ scale: 0.97 }}
                        whileHover={{ scale: 1.01 }}
                        onClick={handleGenerate}
                        disabled={isGenerating}
                        className={cn(
                            "w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all shadow-md",
                            isGenerating
                                ? "bg-violet-400 text-white cursor-not-allowed"
                                : "bg-gradient-to-r from-violet-600 to-purple-600 text-white hover:from-violet-700 hover:to-purple-700 shadow-violet-200"
                        )}
                    >
                        {isGenerating ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Generating campaigns…
                            </>
                        ) : (
                            <>
                                <Wand2 className="w-4 h-4" />
                                Generate Campaigns
                                <ArrowRight className="w-4 h-4" />
                            </>
                        )}
                    </motion.button>
                    {campaigns.length > 0 && !isGenerating && (
                        <button
                            onClick={handleGenerate}
                            className="mt-2 w-full flex items-center justify-center gap-1.5 text-xs text-gray-500 hover:text-violet-600 py-1.5 transition-colors"
                        >
                            <RefreshCw className="w-3.5 h-3.5" />
                            Regenerate
                        </button>
                    )}
                </div>
            </motion.aside>

            {/* ── RIGHT PANEL: Campaign Canvas ── */}
            <div className="flex-1 flex flex-col overflow-hidden">

                {/* Canvas header */}
                <div className="flex items-center justify-between mb-4 shrink-0">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900">Campaign Canvas</h2>
                        <p className="text-sm text-gray-500">
                            {campaigns.length
                                ? `${campaigns.length} campaign concept${campaigns.length !== 1 ? "s" : ""} generated — review, edit captions, and commit posts`
                                : "Your generated campaigns will appear here"}
                        </p>
                    </div>
                    {campaigns.length > 0 && (
                        <button
                            onClick={() => router.push("/publish")}
                            className="flex items-center gap-1.5 text-sm font-medium text-violet-600 hover:text-violet-700 bg-violet-50 hover:bg-violet-100 px-4 py-2 rounded-xl border border-violet-200 transition-all"
                        >
                            <Calendar className="w-4 h-4" />
                            View Publish Calendar
                        </button>
                    )}
                </div>

                {/* Canvas body */}
                <div className="flex-1 overflow-hidden">
                    {isGenerating ? (
                        /* Loading skeleton */
                        <div className="h-full flex items-center justify-center">
                            <div className="text-center">
                                <div className="relative w-20 h-20 mx-auto mb-4">
                                    <div className="absolute inset-0 rounded-full bg-gradient-to-r from-violet-400 to-purple-500 animate-spin [animation-duration:3s] opacity-20" />
                                    <div className="absolute inset-2 rounded-full bg-gradient-to-r from-violet-600 to-purple-600 animate-spin [animation-duration:2s] opacity-40" />
                                    <div className="absolute inset-4 rounded-full bg-violet-600 flex items-center justify-center">
                                        <Wand2 className="w-5 h-5 text-white animate-pulse" />
                                    </div>
                                </div>
                                <p className="text-base font-semibold text-gray-800">Crafting your campaigns…</p>
                                <p className="text-sm text-gray-500 mt-1">AI is building strategies and post blueprints</p>
                            </div>
                        </div>
                    ) : campaigns.length === 0 ? (
                        /* Empty state */
                        <div className="h-full flex items-center justify-center">
                            <div className="text-center max-w-sm">
                                <div className="w-16 h-16 bg-gradient-to-br from-violet-100 to-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-violet-200">
                                    <Sparkles className="w-8 h-8 text-violet-600" />
                                </div>
                                <h3 className="text-base font-semibold text-gray-800 mb-2">Ready to generate</h3>
                                <p className="text-sm text-gray-500 leading-relaxed">
                                    Fill in the Campaign Brief and click{" "}
                                    <strong className="text-violet-600">Generate Campaigns</strong> to create a full
                                    content strategy with ready-to-publish posts.
                                </p>
                            </div>
                        </div>
                    ) : (
                        /* Campaign columns */
                        <div className="h-full overflow-x-auto overflow-y-hidden">
                            <div className="h-full flex gap-4 pb-2 px-1" style={{ minWidth: `${campaigns.length * 360 + 32}px` }}>
                                <AnimatePresence mode="popLayout">
                                    {campaigns.map((campaign) => (
                                        <CampaignColumn
                                            key={campaign.id}
                                            campaign={campaign}
                                            selectedPostIds={selectedPosts[campaign.id] ?? new Set()}
                                            onTogglePost={(postId) => togglePost(campaign.id, postId)}
                                            onToggleAll={() => toggleAllForCampaign(campaign)}
                                            onCaptionChange={(postId, val) =>
                                                handleCaptionChange(campaign.id, postId, val)
                                            }
                                            onCommit={() => handleCommit(campaign)}
                                            isCommitting={committingCampaignId === campaign.id}
                                            assets={assets}
                                        />
                                    ))}
                                </AnimatePresence>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Asset Picker Modal ── */}
            <AnimatePresence>
                {showAssetPicker && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-6"
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 16 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.95, y: 16 }}
                            className="bg-white rounded-2xl w-full max-w-3xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden"
                        >
                            <div className="p-4 border-b flex items-center justify-between">
                                <div>
                                    <h3 className="font-semibold text-gray-900">Select Brand Assets</h3>
                                    <p className="text-xs text-gray-500 mt-0.5">
                                        {selectedAssetIds.length} selected
                                    </p>
                                </div>
                                <div className="flex items-center gap-3">
                                    {selectedAssetIds.length > 0 && (
                                        <button
                                            onClick={() => setSelectedAssetIds([])}
                                            className="text-xs text-red-500 hover:text-red-700 font-medium"
                                        >
                                            Clear all
                                        </button>
                                    )}
                                    <button
                                        onClick={() => setShowAssetPicker(false)}
                                        className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                                    >
                                        <X className="w-5 h-5 text-gray-500" />
                                    </button>
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto p-5 bg-gray-50">
                                {assets.length === 0 ? (
                                    <p className="text-center text-gray-500 py-12 text-sm">
                                        No assets found. Visit the{" "}
                                        <a href="/assets" className="text-violet-600 underline">
                                            Assets page
                                        </a>{" "}
                                        to generate or upload some.
                                    </p>
                                ) : (
                                    <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
                                        {assets.map((asset) => {
                                            const selected = selectedAssetIds.includes(asset.id);
                                            return (
                                                <button
                                                    key={asset.id}
                                                    onClick={() => toggleAsset(asset.id)}
                                                    className={cn(
                                                        "relative aspect-square rounded-xl overflow-hidden border-2 transition-all group",
                                                        selected
                                                            ? "border-violet-500 ring-2 ring-violet-300"
                                                            : "border-transparent hover:border-violet-300"
                                                    )}
                                                >
                                                    <img
                                                        src={`http://localhost:8000/${asset.file_path.replace(/^\.?\//, "")}`}
                                                        alt={asset.prompt ?? "Asset"}
                                                        className="w-full h-full object-cover"
                                                    />
                                                    {selected && (
                                                        <div className="absolute inset-0 bg-violet-600/20 flex items-center justify-center">
                                                            <div className="bg-violet-600 rounded-full p-1">
                                                                <Check className="w-3.5 h-3.5 text-white" />
                                                            </div>
                                                        </div>
                                                    )}
                                                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/50 to-transparent p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <p className="text-[10px] text-white truncate">#{asset.id}</p>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                            <div className="p-4 border-t bg-white">
                                <button
                                    onClick={() => setShowAssetPicker(false)}
                                    className="w-full py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-xl text-sm transition-all shadow-sm"
                                >
                                    Done — {selectedAssetIds.length} asset{selectedAssetIds.length !== 1 ? "s" : ""} selected
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
