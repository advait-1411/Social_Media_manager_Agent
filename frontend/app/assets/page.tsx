"use client"

import { useState, useEffect, useMemo } from 'react';
import { Sparkles, Upload, Search, Filter, RefreshCw, Image as ImageIcon, X, Download, Trash2, ExternalLink, Wand2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import Image from 'next/image';

interface Asset {
    id: number;
    file_path: string;
    created_at: string;
    prompt: string;
    asset_type: string;
    brand_kit_id?: number | null;
    meta_data?: { source?: string;[key: string]: any };
}

interface BrandKit {
    id: number;
    name: string;
    is_default: boolean;
    asset_count: number;
}

export default function AssetsPage() {
    const [assets, setAssets] = useState<Asset[]>([]);
    const [loading, setLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);
    const [prompt, setPrompt] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [backendConnected, setBackendConnected] = useState<boolean | null>(null);

    // New State for Search, Filter, and Preview
    const [searchQuery, setSearchQuery] = useState("");
    const [filterType, setFilterType] = useState("All Assets");
    const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);

    // Remix state
    const [remixAsset, setRemixAsset] = useState<Asset | null>(null);
    const [remixPrompt, setRemixPrompt] = useState("");
    const [remixVariants, setRemixVariants] = useState(1);
    const [isRemixing, setIsRemixing] = useState(false);
    const [remixError, setRemixError] = useState<string | null>(null);
    const [remixSuccess, setRemixSuccess] = useState<string | null>(null);

    // Brand Kit state
    const [brandKits, setBrandKits] = useState<BrandKit[]>([]);
    const [selectedKitId, setSelectedKitId] = useState<number | null>(null);

    // Filter Logic
    const filteredAssets = useMemo(() => {
        return assets.filter(asset => {
            const matchesSearch = (asset.prompt || "").toLowerCase().includes(searchQuery.toLowerCase());

            if (filterType === "All Assets") return matchesSearch;
            if (filterType === "Generated") return matchesSearch && asset.meta_data?.source === "generated";
            if (filterType === "Uploaded") return matchesSearch && asset.meta_data?.source === "upload";

            return matchesSearch;
        });
    }, [assets, searchQuery, filterType]);

    const cleanUrl = (path: string) => `http://localhost:8000/${path.replace(/^\.?\//, '')}`;


    const fetchAssets = async () => {
        try {
            const res = await fetch('http://localhost:8000/api/assets/');
            if (res.ok) {
                const data = await res.json();
                setAssets(data);
            } else {
                console.error("Failed to fetch assets:", res.statusText);
                setError(`Failed to load assets: ${res.status} ${res.statusText}`);
            }
        } catch (error: any) {
            console.error("Failed to fetch assets", error);
            if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
                setError("Cannot connect to backend server. Make sure the backend is running on http://localhost:8000");
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // Check backend connection first
        const checkBackend = async () => {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

                const res = await fetch('http://localhost:8000/', {
                    method: 'GET',
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                setBackendConnected(res.ok);
            } catch (e: any) {
                setBackendConnected(false);
                if (e.name !== 'AbortError') {
                    console.error("Backend not reachable:", e);
                }
            }
        };

        checkBackend();
        fetchAssets();
        // Fetch brand kits
        fetch('http://localhost:8000/api/brand-kits/')
            .then(r => r.ok ? r.json() : [])
            .then((kits: BrandKit[]) => {
                setBrandKits(kits);
                const def = kits.find(k => k.is_default);
                if (def) setSelectedKitId(def.id);
            })
            .catch(() => {});
    }, []);

    const handleGenerate = async () => {
        if (!prompt.trim()) return;

        setIsGenerating(true);
        setError(null);
        setSuccess(null);

        try {
            const res = await fetch('http://localhost:8000/api/assets/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: prompt.trim(),
                    count: 4,
                    model: 'google/gemini-2.5-flash-image',
                    ...(selectedKitId ? { brand_kit_id: selectedKitId } : {}),
                })
            });

            if (res.ok) {
                const data = await res.json();
                setPrompt("");
                setSuccess(`Successfully generated ${data.length} image(s)!`);
                await fetchAssets();
                // Clear success message after 3 seconds
                setTimeout(() => setSuccess(null), 3000);
            } else {
                // Handle error response
                let errorMessage = 'Failed to generate images';
                try {
                    const errorData = await res.json();
                    errorMessage = typeof errorData.detail === 'string'
                        ? errorData.detail
                        : errorData.detail?.message || errorData.message || `Server error (${res.status})`;
                } catch {
                    errorMessage = `Server error: ${res.status} ${res.statusText}`;
                }
                setError(errorMessage);
            }
        } catch (e: any) {
            console.error("Generation error:", e);
            // More specific error messages
            if (e.message?.includes('Failed to fetch') || e.message?.includes('NetworkError')) {
                setError("Cannot connect to backend server. Please ensure:\n1. Backend is running on http://localhost:8000\n2. No firewall is blocking the connection\n3. Check browser console for CORS errors");
            } else if (e.message?.includes('timeout')) {
                setError("Request timed out. The image generation is taking too long. Please try again.");
            } else {
                setError(e.message || "Network error: Could not connect to the server. Make sure the backend is running on port 8000.");
            }
        } finally {
            setIsGenerating(false);
        }
    };

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        setError(null);
        setSuccess(null);

        // Upload each file
        const uploadPromises = Array.from(files).map(async (file) => {
            const formData = new FormData();
            formData.append('file', file);

            try {
                const res = await fetch('http://localhost:8000/api/assets/upload', {
                    method: 'POST',
                    body: formData
                });

                if (!res.ok) {
                    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
                    throw new Error(errorData.detail || `Upload failed: ${res.statusText}`);
                }

                return await res.json();
            } catch (error: any) {
                throw new Error(`Failed to upload ${file.name}: ${error.message}`);
            }
        });

        try {
            const results = await Promise.all(uploadPromises);
            setSuccess(`Successfully uploaded ${results.length} file(s)!`);
            await fetchAssets();
            // Clear success message after 3 seconds
            setTimeout(() => setSuccess(null), 3000);
        } catch (error: any) {
            setError(error.message || "Failed to upload files");
        } finally {
            // Reset file input
            e.target.value = '';
        }
    };

    const handleDelete = async (asset: Asset) => {
        if (!confirm("Are you sure you want to delete this asset?")) return;

        try {
            const res = await fetch(`http://localhost:8000/api/assets/${asset.id}`, {
                method: 'DELETE'
            });

            if (res.ok) {
                setAssets(prev => prev.filter(a => a.id !== asset.id));
                setSelectedAsset(null);
                setSuccess("Asset deleted successfully");
                setTimeout(() => setSuccess(null), 3000);
            } else {
                throw new Error("Failed to delete asset");
            }
        } catch (error) {
            console.error("Delete error:", error);
            setError("Failed to delete asset");
        }
    };

    const handleDownload = async (asset: Asset) => {
        try {
            const imageUrl = cleanUrl(asset.file_path);
            const response = await fetch(imageUrl);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            const filename = asset.file_path.split('/').pop() || `asset-${asset.id}.png`;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Download error:", error);
            setError("Failed to download asset");
        }
    };

    const handleRemix = async () => {
        if (!remixAsset || !remixPrompt.trim()) return;
        setIsRemixing(true);
        setRemixError(null);
        setRemixSuccess(null);
        try {
            const res = await fetch(`http://localhost:8000/api/assets/${remixAsset.id}/remix`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: remixPrompt.trim(), num_variants: remixVariants }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({ detail: res.statusText }));
                throw new Error(err.detail || 'Remix failed');
            }
            const newAssets: Asset[] = await res.json();
            setAssets(prev => [...newAssets, ...prev]);
            setRemixSuccess(`✓ Created ${newAssets.length} remix${newAssets.length > 1 ? 'es' : ''}!`);
            setTimeout(() => {
                setRemixAsset(null);
                setRemixPrompt("");
                setRemixVariants(1);
                setRemixSuccess(null);
            }, 2000);
        } catch (err: any) {
            setRemixError(err.message || 'Remix failed');
        } finally {
            setIsRemixing(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Create Images</h1>
                    <p className="text-gray-500 text-sm">Manage your generated images and uploads.</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => document.getElementById('gen-panel')?.scrollIntoView({ behavior: 'smooth' })}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 flex items-center gap-2 shadow-sm"
                    >
                        <Sparkles className="w-4 h-4" />
                        Generate New
                    </button>
                    <label className="bg-white border text-gray-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-50 flex items-center gap-2 shadow-sm cursor-pointer">
                        <Upload className="w-4 h-4" />
                        <input
                            type="file"
                            accept="image/*,video/*"
                            className="hidden"
                            onChange={handleUpload}
                            multiple
                        />
                        Upload
                    </label>
                </div>
            </div>

            {/* Generator Panel */}
            <div id="gen-panel" className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden">
                <div className="max-w-3xl">
                    {/* Backend Connection Status */}
                    {backendConnected === false && (
                        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                            <p className="text-sm text-yellow-800">
                                <strong>⚠️ Backend not connected:</strong> Make sure the backend server is running on <code className="bg-yellow-100 px-1 rounded">http://localhost:8000</code>
                            </p>
                        </div>
                    )}

                    <label className="block text-sm font-medium text-gray-700 mb-2">Generate Images with AI</label>

                    {/* Brand Kit selector */}
                    {brandKits.length > 0 && (
                        <div className="mb-3 flex items-center gap-3">
                            <label className="text-sm font-medium text-gray-600 whitespace-nowrap">Brand Kit</label>
                            <select
                                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white"
                                value={selectedKitId ?? ''}
                                onChange={e => setSelectedKitId(e.target.value ? Number(e.target.value) : null)}
                            >
                                <option value="">No kit (ONIDA default)</option>
                                {brandKits.map(k => (
                                    <option key={k.id} value={k.id}>
                                        {k.name}{k.is_default ? ' (default)' : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div className="flex gap-2">
                        <input
                            type="text"
                            className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                            placeholder="Describe the image you want..."
                            value={prompt}
                            onChange={(e) => {
                                setPrompt(e.target.value);
                                setError(null);
                            }}
                            onKeyDown={(e) => e.key === 'Enter' && !isGenerating && prompt.trim() && handleGenerate()}
                            disabled={isGenerating}
                        />
                        <button
                            onClick={handleGenerate}
                            disabled={isGenerating || !prompt.trim()}
                            className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {isGenerating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                            {isGenerating ? 'Generating...' : 'Generate'}
                        </button>
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                            <p className="text-sm text-red-700 whitespace-pre-line">{error}</p>
                        </div>
                    )}

                    {/* Success Message */}
                    {success && (
                        <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                            <p className="text-sm text-green-700">{success}</p>
                        </div>
                    )}

                    <p className="text-xs text-gray-400 mt-2">Powered by Gemini 2.5 Flash / OpenRouter</p>
                </div>
                {/* Background decoration */}
                <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                    <Sparkles className="w-32 h-32 text-indigo-600" />
                </div>
            </div>

            {/* Filters & Search */}
            <h2 className="text-xl font-bold text-gray-900 ml-1">Manage Assets</h2>
            <div className="flex flex-col sm:flex-row gap-4 items-center bg-white p-2 rounded-lg border border-gray-200 shadow-sm sticky top-0 z-10 backdrop-blur-xl bg-white/80 transition-all">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                        type="text"
                        placeholder="Search assets by prompt..."
                        className="w-full pl-9 pr-4 py-2 text-sm outline-none bg-transparent"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <div className="flex gap-2 w-full sm:w-auto px-2">
                    <div className="flex items-center gap-2 border-l pl-4 border-gray-200">
                        <Filter className="w-4 h-4 text-gray-400" />
                        <select
                            className="text-sm bg-transparent outline-none text-gray-600 cursor-pointer py-1"
                            value={filterType}
                            onChange={(e) => setFilterType(e.target.value)}
                        >
                            <option>All Assets</option>
                            <option>Generated</option>
                            <option>Uploaded</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Asset Grid */}
            {loading ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 animate-pulse">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                        <div key={i} className="aspect-square bg-gray-200 rounded-xl"></div>
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
                    {filteredAssets.map((asset) => {
                        const imageUrl = cleanUrl(asset.file_path);

                        return (
                            <motion.div
                                key={asset.id}
                                layout
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                onClick={() => setSelectedAsset(asset)}
                                className="group relative aspect-square bg-gray-100 rounded-xl overflow-hidden border border-gray-200 shadow-sm hover:shadow-md transition-all cursor-pointer ring-offset-2 hover:ring-2 hover:ring-blue-500/50"
                            >
                                <Image
                                    src={imageUrl}
                                    alt={asset.prompt || "Asset"}
                                    fill
                                    className="object-cover transition-transform duration-500 group-hover:scale-110"
                                    unoptimized
                                />

                                {/* Overlay */}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                                    <p className="text-white text-xs line-clamp-2 font-medium mb-2">{asset.prompt || "No prompt"}</p>
                                    <div className="flex gap-2 items-center justify-between">
                                        <span className="text-[10px] text-white/80 uppercase tracking-wider bg-black/20 px-1.5 py-0.5 rounded backdrop-blur-sm">
                                            {asset.meta_data?.source || asset.asset_type || "asset"}
                                        </span>
                                        {/* Kit badge */}
                                        {asset.brand_kit_id && (() => {
                                            const kit = brandKits.find(k => k.id === asset.brand_kit_id);
                                            return kit ? (
                                                <span className="text-[9px] bg-indigo-600/80 text-white px-1.5 py-0.5 rounded-full font-semibold backdrop-blur-sm">
                                                    {kit.name}
                                                </span>
                                            ) : null;
                                        })()}
                                        <button
                                            title="Style with AI"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setRemixAsset(asset);
                                                setRemixPrompt("");
                                                setRemixError(null);
                                                setRemixSuccess(null);
                                            }}
                                            className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-semibold px-2 py-1 rounded-full transition-colors shadow"
                                        >
                                            <Wand2 className="w-3 h-3" />
                                            Style
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        )
                    })}
                </div>
            )}

            {!loading && assets.length === 0 && (
                <div className="text-center py-20">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
                        <ImageIcon className="w-8 h-8 text-gray-400" />
                    </div>
                    <h3 className="text-gray-900 font-medium">No assets yet</h3>
                    <p className="text-gray-500 text-sm mt-1">Generate some images or upload your own.</p>
                </div>
            )}

            {/* Asset Preview Modal */}
            <AnimatePresence>
                {selectedAsset && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 sm:p-8"
                        onClick={() => setSelectedAsset(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.95, y: 20 }}
                            className="bg-white rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col md:flex-row shadow-2xl overflow-hidden"
                            onClick={e => e.stopPropagation()}
                        >
                            {/* Image Section */}
                            <div className="flex-1 bg-gray-100 relative min-h-[400px] md:min-h-full">
                                <Image
                                    src={cleanUrl(selectedAsset.file_path)}
                                    alt={selectedAsset.prompt || "Asset Preview"}
                                    fill
                                    className="object-contain p-4"
                                    unoptimized
                                />
                            </div>

                            {/* Details Section */}
                            <div className="w-full md:w-96 bg-white p-6 flex flex-col border-l border-gray-100">
                                <div className="flex justify-between items-start mb-6">
                                    <h3 className="text-xl font-bold text-gray-900">Asset Details</h3>
                                    <button
                                        onClick={() => setSelectedAsset(null)}
                                        className="p-1 hover:bg-gray-100 rounded-full text-gray-500 hover:text-gray-900 transition-colors"
                                    >
                                        <X className="w-6 h-6" />
                                    </button>
                                </div>

                                <div className="space-y-6 flex-1 overflow-y-auto">
                                    <div>
                                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Prompt</label>
                                        <p className="text-sm text-gray-700 mt-1 leading-relaxed">
                                            {selectedAsset.prompt || <span className="text-gray-400 italic">No prompt available</span>}
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</label>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className={cn(
                                                    "px-2 py-1 rounded-full text-xs font-medium capitalize",
                                                    selectedAsset.meta_data?.source === 'generated' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                                                )}>
                                                    {selectedAsset.meta_data?.source || selectedAsset.asset_type}
                                                </span>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Created</label>
                                            <p className="text-sm text-gray-900 mt-1">
                                                {new Date(selectedAsset.created_at).toLocaleDateString()}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-6 mt-6 border-t border-gray-100 space-y-3">
                                    <button
                                        onClick={() => handleDownload(selectedAsset)}
                                        className="flex items-center justify-center gap-2 w-full bg-gray-900 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-gray-800 transition-all hover:scale-[1.02]"
                                    >
                                        <Download className="w-4 h-4" />
                                        Download Image
                                    </button>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => window.open(cleanUrl(selectedAsset.file_path), '_blank')}
                                            className="flex-1 flex items-center justify-center gap-2 border border-gray-200 text-gray-700 px-4 py-2.5 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                                        >
                                            <ExternalLink className="w-4 h-4" />
                                            Open Full
                                        </button>
                                        {/* TODO: Add delete functionality */}
                                        <button
                                            onClick={() => handleDelete(selectedAsset)}
                                            className="flex items-center justify-center p-2.5 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                                            title="Delete Asset"
                                        >
                                            <Trash2 className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Remix Modal ─────────────────────────────────────────────── */}
            <AnimatePresence>
                {remixAsset && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                        onClick={() => !isRemixing && setRemixAsset(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.95, y: 20 }}
                            className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden"
                            onClick={e => e.stopPropagation()}
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                                <div className="flex items-center gap-2">
                                    <Wand2 className="w-5 h-5 text-indigo-600" />
                                    <h2 className="text-lg font-bold text-gray-900">Style with AI</h2>
                                </div>
                                <button
                                    onClick={() => setRemixAsset(null)}
                                    disabled={isRemixing}
                                    className="p-1 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-700 transition-colors disabled:opacity-40"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="p-6 space-y-5">
                                {/* Source thumbnail */}
                                <div className="flex items-center gap-4 bg-gray-50 rounded-xl p-3">
                                    <div className="relative w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 border border-gray-200">
                                        <Image
                                            src={cleanUrl(remixAsset.file_path)}
                                            alt={remixAsset.prompt || "source"}
                                            fill
                                            className="object-cover"
                                            unoptimized
                                        />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Source Asset</p>
                                        <p className="text-sm text-gray-800 line-clamp-2">{remixAsset.prompt || `Asset #${remixAsset.id}`}</p>
                                    </div>
                                </div>

                                {/* Prompt */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                        Scene / Style Prompt
                                    </label>
                                    <textarea
                                        rows={3}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none transition-all"
                                        placeholder="e.g. cosy Diwali living room with warm fairy lights…"
                                        value={remixPrompt}
                                        onChange={e => setRemixPrompt(e.target.value)}
                                        disabled={isRemixing}
                                    />
                                    <p className="text-xs text-gray-400 mt-1">Describe the background scene. Your product will be composited on top.</p>
                                </div>

                                {/* Variant count */}
                                <div className="flex items-center gap-4">
                                    <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Number of variants</label>
                                    <div className="flex gap-2">
                                        {[1, 2, 3].map(n => (
                                            <button
                                                key={n}
                                                onClick={() => setRemixVariants(n)}
                                                disabled={isRemixing}
                                                className={`w-9 h-9 rounded-full text-sm font-semibold border-2 transition-all ${remixVariants === n
                                                    ? 'border-indigo-600 bg-indigo-600 text-white'
                                                    : 'border-gray-200 text-gray-600 hover:border-indigo-400'
                                                    }`}
                                            >
                                                {n}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Feedback */}
                                {remixError && (
                                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                                        <p className="text-sm text-red-700">{remixError}</p>
                                    </div>
                                )}
                                {remixSuccess && (
                                    <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                                        <p className="text-sm text-green-700 font-medium">{remixSuccess}</p>
                                    </div>
                                )}
                            </div>

                            {/* Footer */}
                            <div className="px-6 pb-6 flex gap-3">
                                <button
                                    onClick={() => setRemixAsset(null)}
                                    disabled={isRemixing}
                                    className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-lg font-medium hover:bg-gray-50 transition-colors disabled:opacity-40"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleRemix}
                                    disabled={isRemixing || !remixPrompt.trim()}
                                    className="flex-1 bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
                                >
                                    {isRemixing
                                        ? <><RefreshCw className="w-4 h-4 animate-spin" /> Remixing…</>
                                        : <><Wand2 className="w-4 h-4" /> Generate Remix</>}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
