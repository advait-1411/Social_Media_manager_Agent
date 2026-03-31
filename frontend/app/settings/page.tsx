"use client"

import { useState, useEffect, useRef } from 'react';
import {
    Instagram, Linkedin, Twitter, Globe, Plus,
    Check, AlertCircle, Settings2, Clock, Trash2, RefreshCw,
    Package, Save, Upload, X, ChevronRight, Loader2, ChevronDown,
    ImageIcon, Shield, Info, Sparkles
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { productKitsApi, type ProductKit, type KitAsset } from '@/lib/api';

interface Channel {
    id: number;
    platform: string;
    name: string;
    is_active: boolean;
    credentials: { user_id: string; access_token: string };
}

const PLATFORMS = [
    { id: 'instagram', name: 'Instagram', icon: Instagram, color: 'bg-gradient-to-br from-purple-500 to-pink-500', available: true },
    { id: 'linkedin', name: 'LinkedIn', icon: Linkedin, color: 'bg-blue-600', available: false },
    { id: 'twitter', name: 'X / Twitter', icon: Twitter, color: 'bg-black', available: false },
];

const API = 'http://localhost:8000';

// ── Staged asset for upload (before actually sending to server) ──────────
interface StagedAsset {
    id: string; // local temp id
    file: File;
    name: string;
    preview: string;
    assetType: 'product_asset' | 'logo_trademark';
}

export default function SettingsPage() {
    const [channels, setChannels] = useState<Channel[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('channels');

    // Product Kit state
    const [kits, setKits] = useState<ProductKit[]>([]);
    const [selectedKit, setSelectedKit] = useState<ProductKit | null>(null);
    const [kitsLoading, setKitsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [previewImage, setPreviewImage] = useState<string | null>(null);

    // Editable fields (controlled)
    const [editName, setEditName] = useState('');
    const [editDesc, setEditDesc] = useState('');
    const [editGuidelines, setEditGuidelines] = useState('');

    // New Kit modal state
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newKitName, setNewKitName] = useState('');
    const [newKitDesc, setNewKitDesc] = useState('');
    const [newKitGuidelines, setNewKitGuidelines] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    // Staged assets in the Create modal
    const [stagedProductAssets, setStagedProductAssets] = useState<StagedAsset[]>([]);
    const [stagedLogoAssets, setStagedLogoAssets] = useState<StagedAsset[]>([]);
    const [assetNames, setAssetNames] = useState<Record<string, string>>({});

    const productAssetInputRef = useRef<HTMLInputElement>(null);
    const logoAssetInputRef = useRef<HTMLInputElement>(null);

    const MAX_PRODUCT_ASSET_SLOTS = 3;
    const MAX_LOGO_SLOTS = 1;

    const fetchChannels = async () => {
        try {
            const res = await fetch(`${API}/api/connectors/`);
            if (res.ok) setChannels(await res.json());
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const fetchKits = async () => {
        setKitsLoading(true);
        try {
            const data = await productKitsApi.list();
            setKits(data);
            const def = data.find(k => k.is_default) ?? data[0] ?? null;
            if (def && !selectedKit) loadKit(def);
        } catch (e) {
            toast.error('Failed to load Product Kits');
        } finally {
            setKitsLoading(false);
        }
    };

    const loadKit = (kit: ProductKit) => {
        setSelectedKit(kit);
        setEditName(kit.name);
        setEditDesc(kit.description ?? '');
        setEditGuidelines(kit.product_guidelines ?? kit.system_prompt ?? '');
    };

    const resetCreateModal = () => {
        setNewKitName('');
        setNewKitDesc('');
        setNewKitGuidelines('');
        setStagedProductAssets([]);
        setStagedLogoAssets([]);
        setAssetNames({});
    };

    useEffect(() => { fetchChannels(); }, []);
    useEffect(() => {
        if (activeTab === 'brand') fetchKits();
    }, [activeTab]);

    const handleSaveKit = async () => {
        if (!selectedKit) return;
        setIsSaving(true);
        try {
            const updated = await productKitsApi.update(selectedKit.id, {
                name: editName,
                description: editDesc,
                product_guidelines: editGuidelines,
            });
            setKits(prev => prev.map(k => k.id === updated.id ? updated : k));
            setSelectedKit(updated);
            toast.success('Product Kit saved!');
        } catch (err: any) {
            toast.error(err.message || 'Failed to save');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteKit = async () => {
        if (!selectedKit) return;
        setIsDeleting(true);
        try {
            await productKitsApi.delete(selectedKit.id);
            setKits(prev => prev.filter(k => k.id !== selectedKit.id));
            setSelectedKit(null); // Return to default empty state
            setShowDeleteConfirm(false);
            toast.success(`Product Kit deleted`);
        } catch (err: any) {
            toast.error(err.message || 'Failed to delete kit');
        } finally {
            setIsDeleting(false);
        }
    };

    const stageFile = (
        file: File,
        assetType: 'product_asset' | 'logo_trademark',
        setter: React.Dispatch<React.SetStateAction<StagedAsset[]>>,
    ) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const preview = URL.createObjectURL(file);
        setter(prev => [...prev, { id, file, name: '', preview, assetType }]);
        setAssetNames(prev => ({ ...prev, [id]: '' }));
    };

    const handleCreateKit = async () => {
        if (!newKitName.trim() || !newKitGuidelines.trim()) {
            toast.error('Product Kit Name and Product Guidelines are required.');
            return;
        }
        // Validate asset names
        const allStaged = [...stagedProductAssets, ...stagedLogoAssets];
        for (const s of allStaged) {
            const name = (assetNames[s.id] ?? '').trim();
            if (!name) {
                toast.error(`Please enter a name for each uploaded asset before creating the kit.`);
                return;
            }
        }
        setIsCreating(true);
        try {
            // 1. Create the kit
            const created = await productKitsApi.create({
                name: newKitName.trim(),
                description: newKitDesc.trim() || undefined,
                product_guidelines: newKitGuidelines.trim(),
            });

            // 2. Upload staged assets
            let uploaded = 0;
            for (const staged of allStaged) {
                const name = (assetNames[staged.id] ?? '').trim();
                try {
                    await productKitsApi.uploadKitAsset(
                        created.id,
                        staged.file,
                        name,
                        staged.assetType,
                    );
                    uploaded++;
                } catch (e: any) {
                    toast.error(`Asset "${name}" upload failed: ${e.message}`);
                }
            }

            // 3. Refresh kit with updated assets
            const refreshed = await productKitsApi.list();
            const updatedKit = refreshed.find(k => k.id === created.id) ?? created;
            setKits(refreshed);
            loadKit(updatedKit as ProductKit);
            setShowCreateModal(false);
            resetCreateModal();
            toast.success(
                `Product Kit "${created.name}" created!` +
                (uploaded > 0 ? ` ${uploaded} asset(s) uploaded.` : '')
            );
        } catch (err: any) {
            toast.error(err.message || 'Failed to create kit');
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
                <p className="text-gray-500 text-sm">Manage your connected channels and preferences.</p>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
                {['channels', 'brand', 'schedule', 'team'].map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={cn(
                            "px-4 py-2 rounded-md text-sm font-medium capitalize transition-all",
                            activeTab === tab
                                ? "bg-white text-gray-900 shadow-sm"
                                : "text-gray-500 hover:text-gray-700"
                        )}
                    >
                        {tab === 'brand' ? 'Product Kits' : tab}
                    </button>
                ))}
            </div>

            {activeTab === 'channels' && (
                <div className="space-y-6">
                    <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                            <h2 className="font-semibold text-gray-900">Connected Channels</h2>
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">
                                {channels.length} connected
                            </span>
                        </div>
                        {loading ? (
                            <div className="p-6 animate-pulse space-y-4">
                                {[1, 2].map(i => <div key={i} className="h-16 bg-gray-100 rounded-lg" />)}
                            </div>
                        ) : channels.length > 0 ? (
                            <div className="divide-y divide-gray-100">
                                {channels.map(ch => {
                                    const platform = PLATFORMS.find(p => p.id === ch.platform);
                                    const Icon = platform?.icon || Globe;
                                    return (
                                        <motion.div
                                            key={ch.id}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center text-white", platform?.color || 'bg-gray-400')}>
                                                    <Icon className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <p className="font-medium text-gray-900">{ch.name}</p>
                                                    <p className="text-xs text-gray-500 capitalize">{ch.platform}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                                                    <Check className="w-3 h-3" /> Connected
                                                </span>
                                                <button className="p-2 hover:bg-gray-100 rounded-md text-gray-400 hover:text-gray-600">
                                                    <Settings2 className="w-4 h-4" />
                                                </button>
                                                <button className="p-2 hover:bg-red-50 rounded-md text-gray-400 hover:text-red-600">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="p-8 text-center">
                                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 mb-4">
                                    <AlertCircle className="w-6 h-6 text-gray-400" />
                                </div>
                                <p className="text-gray-900 font-medium">No channels connected</p>
                                <p className="text-sm text-gray-500 mt-1">Connect your first social account below.</p>
                            </div>
                        )}
                    </section>

                    <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100">
                            <h2 className="font-semibold text-gray-900">Available Platforms</h2>
                        </div>
                        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                            {PLATFORMS.map(platform => {
                                const isConnected = channels.some(c => c.platform === platform.id);
                                return (
                                    <div
                                        key={platform.id}
                                        className={cn(
                                            "relative rounded-xl border p-5 transition-all",
                                            platform.available
                                                ? "border-gray-200 hover:border-blue-300 hover:shadow-md cursor-pointer"
                                                : "border-gray-100 bg-gray-50 opacity-60"
                                        )}
                                    >
                                        <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center text-white mb-4", platform.color)}>
                                            <platform.icon className="w-6 h-6" />
                                        </div>
                                        <h3 className="font-semibold text-gray-900">{platform.name}</h3>
                                        <p className="text-xs text-gray-500 mt-1">
                                            {platform.available
                                                ? isConnected ? "Connected" : "Click to connect"
                                                : "Coming soon"
                                            }
                                        </p>
                                        {isConnected && (
                                            <div className="absolute top-3 right-3">
                                                <Check className="w-5 h-5 text-green-500" />
                                            </div>
                                        )}
                                        {!platform.available && (
                                            <span className="absolute top-3 right-3 text-[10px] bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full font-medium">SOON</span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                </div>
            )}

            {activeTab === 'schedule' && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <Clock className="w-5 h-5 text-blue-600" />
                        <h2 className="font-semibold text-gray-900">Posting Schedule</h2>
                    </div>
                    <p className="text-gray-500 text-sm">Configure your default posting times for each platform.</p>
                    <div className="mt-6 p-8 border-2 border-dashed border-gray-200 rounded-xl text-center">
                        <p className="text-gray-400">Schedule configuration coming soon...</p>
                    </div>
                </div>
            )}

            {/* ── Product Kits Tab ─────────────────────────────────────────────── */}
            {activeTab === 'brand' && (
                <div className="space-y-6">
                    {kitsLoading ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                        </div>
                    ) : (
                        <>
                            {/* Kit switcher */}
                            {kits.length > 0 && (
                                <div className="flex gap-2 flex-wrap">
                                    {kits.map(kit => (
                                        <button
                                            key={kit.id}
                                            onClick={() => loadKit(kit)}
                                            className={cn(
                                                'flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-all',
                                                selectedKit?.id === kit.id
                                                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                                                    : 'bg-white border-gray-200 text-gray-700 hover:border-indigo-300'
                                            )}
                                        >
                                            <Package className="w-4 h-4" />
                                            {kit.name}
                                            {kit.is_default && (
                                                <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded-full font-semibold">DEFAULT</span>
                                            )}
                                            <span className="text-[10px] opacity-70">{kit.kit_assets?.length ?? 0} assets</span>
                                        </button>
                                    ))}
                                    <button
                                        onClick={() => setShowCreateModal(true)}
                                        className="flex items-center gap-2 px-4 py-2 rounded-xl border border-dashed border-gray-300 text-sm font-medium text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition-all"
                                    >
                                        <Plus className="w-4 h-4" />
                                        New Product Kit
                                    </button>
                                </div>
                            )}

                            {/* Selected kit editor */}
                            {selectedKit ? (
                                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-6">
                                    <div className="flex items-center justify-between">
                                        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                                            <Package className="w-4 h-4 text-indigo-600" />
                                            Product Kit — {selectedKit.is_default ? 'Default' : 'Custom'}
                                        </h2>
                                        <div className="flex items-center gap-2">
                                            {!selectedKit.is_default && (
                                                <button
                                                    onClick={() => setShowDeleteConfirm(true)}
                                                    disabled={isSaving || isDeleting}
                                                    className="flex items-center gap-2 text-red-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50 transition-colors"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                    Delete
                                                </button>
                                            )}
                                            <button
                                                onClick={handleSaveKit}
                                                disabled={isSaving || isDeleting}
                                                className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                                            >
                                                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                                {isSaving ? 'Saving…' : 'Save Changes'}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Name & Description */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Product Kit Name</label>
                                            <input
                                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                                                value={editName}
                                                onChange={e => setEditName(e.target.value)}
                                                disabled={selectedKit.is_default}
                                                title={selectedKit.is_default ? 'Cannot rename the default kit' : undefined}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Description</label>
                                            <input
                                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                                                value={editDesc}
                                                onChange={e => setEditDesc(e.target.value)}
                                                placeholder="Short description of this kit…"
                                            />
                                        </div>
                                    </div>

                                    {/* Product Guidelines */}
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Product Guidelines</label>
                                        <div className="flex items-start gap-2 mb-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                                            <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                                            <p className="text-xs text-blue-700">
                                                Product Guidelines are injected into <strong>image generation only</strong>. They are not used for caption generation.
                                            </p>
                                        </div>
                                        <textarea
                                            rows={8}
                                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-y"
                                            value={editGuidelines}
                                            onChange={e => setEditGuidelines(e.target.value)}
                                            placeholder="Visual brand constraints sent to the AI model for image generation…"
                                        />
                                        <p className="text-xs text-gray-400 mt-1">{editGuidelines.length} characters</p>
                                    </div>

                                    {/* Typed Assets Display */}
                                    {selectedKit.kit_assets && selectedKit.kit_assets.length > 0 && (
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Kit Assets</label>
                                            <div className="grid grid-cols-2 gap-4">
                                                {/* Product Assets */}
                                                <div>
                                                    <p className="text-xs font-medium text-gray-600 mb-2 flex items-center gap-1.5">
                                                        <ImageIcon className="w-3.5 h-3.5 text-indigo-500" />
                                                        Product Assets
                                                        <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full">Used in generation</span>
                                                    </p>
                                                    <div className="space-y-2">
                                                        {selectedKit.kit_assets.filter(a => a.asset_type === 'product_asset').map(ka => (
                                                            <div key={ka.id} onClick={() => setPreviewImage(`http://localhost:8000/${ka.file_path.replace(/^\.?\//, '')}`)} className="cursor-pointer flex items-center gap-3 bg-gray-50 rounded-lg p-2 border border-gray-100 shadow-sm transition-all hover:bg-white hover:shadow-md hover:border-gray-200">
                                                                <div className="w-10 h-10 rounded-md overflow-hidden bg-gray-200 shrink-0 outline outline-1 outline-gray-200">
                                                                    <img src={`http://localhost:8000/${ka.file_path.replace(/^\.?\//, '')}`} alt={ka.name} className="w-full h-full object-cover" />
                                                                </div>
                                                                <span className="text-sm text-gray-800 font-medium truncate">{ka.name}</span>
                                                                <span className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded ml-auto font-mono shrink-0 border border-indigo-100">@{ka.token}</span>
                                                            </div>
                                                        ))}
                                                        {selectedKit.kit_assets.filter(a => a.asset_type === 'product_asset').length === 0 && (
                                                            <p className="text-xs text-gray-400 italic">No product assets yet</p>
                                                        )}
                                                    </div>
                                                </div>
                                                {/* Logo Assets */}
                                                <div>
                                                    <p className="text-xs font-medium text-gray-600 mb-2 flex items-center gap-1.5">
                                                        <Shield className="w-3.5 h-3.5 text-orange-500" />
                                                        Logos / Trademarks
                                                        <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full">Overlay only</span>
                                                    </p>
                                                    <div className="space-y-2">
                                                        {selectedKit.kit_assets.filter(a => a.asset_type === 'logo_trademark').map(ka => (
                                                            <div key={ka.id} onClick={() => setPreviewImage(`http://localhost:8000/${ka.file_path.replace(/^\.?\//, '')}`)} className="cursor-pointer flex items-center gap-3 bg-gray-50 rounded-lg p-2 border border-gray-100 shadow-sm transition-all hover:bg-white hover:shadow-md hover:border-gray-200">
                                                                <div className="w-10 h-10 rounded-md overflow-hidden bg-gray-100 shrink-0 outline outline-1 outline-gray-200 p-1 flex items-center justify-center">
                                                                    <img src={`http://localhost:8000/${ka.file_path.replace(/^\.?\//, '')}`} alt={ka.name} className="max-w-full max-h-full object-contain" />
                                                                </div>
                                                                <span className="text-sm text-gray-800 font-medium truncate">{ka.name}</span>
                                                                <span className="text-[10px] bg-orange-50 text-orange-600 px-2 py-0.5 rounded ml-auto font-mono shrink-0 border border-orange-100">@{ka.token}</span>
                                                            </div>
                                                        ))}
                                                        {selectedKit.kit_assets.filter(a => a.asset_type === 'logo_trademark').length === 0 && (
                                                            <p className="text-xs text-gray-400 italic">No logos yet</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
                                    <Package className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                                    <p className="text-gray-500 font-medium">No product kits yet.</p>
                                    <button
                                        onClick={() => setShowCreateModal(true)}
                                        className="mt-4 bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
                                    >
                                        Create First Product Kit
                                    </button>
                                </div>
                            )}

                            {/* Delete Confirmation Modal */}
                            <AnimatePresence>
                                {showDeleteConfirm && selectedKit && (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
                                        onClick={e => { if (e.target === e.currentTarget) setShowDeleteConfirm(false); }}
                                    >
                                        <motion.div
                                            initial={{ scale: 0.95, y: 20 }}
                                            animate={{ scale: 1, y: 0 }}
                                            exit={{ scale: 0.95, y: 20 }}
                                            className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6 relative overflow-hidden"
                                        >
                                            <div className="flex items-center gap-3 text-red-600 mb-4">
                                                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                                                    <AlertCircle className="w-6 h-6" />
                                                </div>
                                                <h3 className="text-lg font-bold text-gray-900">Delete Product Kit?</h3>
                                            </div>
                                            <p className="text-gray-600 text-sm mb-6">
                                                Are you sure you want to delete <strong>{selectedKit.name}</strong>? This will permanently delete all associated assets and logos. This action cannot be undone.
                                            </p>
                                            <div className="flex gap-3 justify-end">
                                                <button
                                                    onClick={() => setShowDeleteConfirm(false)}
                                                    className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 flex-1"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    onClick={handleDeleteKit}
                                                    disabled={isDeleting}
                                                    className="flex items-center justify-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors flex-1"
                                                >
                                                    {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                                    {isDeleting ? 'Deleting…' : 'Yes, delete kit'}
                                                </button>
                                            </div>
                                        </motion.div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Fullscreen Image Preview Modal */}
                            <AnimatePresence>
                                {previewImage && (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
                                        onClick={() => setPreviewImage(null)}
                                    >
                                        <button 
                                            onClick={() => setPreviewImage(null)}
                                            className="absolute top-6 right-6 bg-white/10 hover:bg-white/20 text-white p-2 rounded-full transition-colors"
                                        >
                                            <X className="w-6 h-6" />
                                        </button>
                                        <motion.img
                                            initial={{ scale: 0.9 }}
                                            animate={{ scale: 1 }}
                                            exit={{ scale: 0.9 }}
                                            src={previewImage}
                                            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg drop-shadow-2xl"
                                        />
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </>
                    )}
                </div>
            )}

            {activeTab === 'team' && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                    <h2 className="font-semibold text-gray-900 mb-4">Team Members</h2>
                    <p className="text-gray-500 text-sm">Invite team members and manage roles.</p>
                    <div className="mt-6 p-8 border-2 border-dashed border-gray-200 rounded-xl text-center">
                        <p className="text-gray-400">Team management coming soon...</p>
                    </div>
                </div>
            )}

            {/* ── Create New Product Kit Modal ─────────────────────────────────── */}
            <AnimatePresence>
                {showCreateModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
                        onClick={e => { if (e.target === e.currentTarget) setShowCreateModal(false); }}
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.95, y: 20 }}
                            className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
                        >
                            {/* Modal header */}
                            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
                                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                    <Package className="w-5 h-5 text-indigo-600" />
                                    Create New Product Kit
                                </h3>
                                <button onClick={() => { setShowCreateModal(false); resetCreateModal(); }} className="p-1 hover:bg-gray-100 rounded-full">
                                    <X className="w-5 h-5 text-gray-400" />
                                </button>
                            </div>

                            <div className="p-6 space-y-6 overflow-y-auto flex-1">
                                {/* Name & Description */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Product Kit Name *</label>
                                        <input
                                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                            placeholder="e.g. Nike Hypervenom"
                                            value={newKitName}
                                            onChange={e => setNewKitName(e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Description</label>
                                        <input
                                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                            placeholder="Optional short description"
                                            value={newKitDesc}
                                            onChange={e => setNewKitDesc(e.target.value)}
                                        />
                                    </div>
                                </div>

                                {/* Product Guidelines */}
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Product Guidelines *</label>
                                    <div className="flex items-start gap-2 mb-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                                        <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                                        <p className="text-xs text-blue-700">
                                            These guidelines are used for <strong>image generation only</strong>. They are not passed to caption generation.
                                        </p>
                                    </div>
                                    <textarea
                                        rows={6}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none resize-y"
                                        placeholder="Describe the visual style, colors, mood, and constraints for AI image generation…"
                                        value={newKitGuidelines}
                                        onChange={e => setNewKitGuidelines(e.target.value)}
                                    />
                                    <p className="text-xs text-gray-400 mt-1">This prompt will be passed to the AI image model only.</p>
                                </div>

                                {/* ══ Product Assets Section ══════════════════════════ */}
                                <div className="border border-gray-200 rounded-xl overflow-hidden">
                                    <div className="px-4 py-3 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <ImageIcon className="w-4 h-4 text-indigo-600" />
                                            <span className="text-sm font-semibold text-indigo-900">Product Assets</span>
                                            <span className="text-[10px] bg-indigo-200 text-indigo-800 px-1.5 py-0.5 rounded-full font-semibold">USED IN IMAGE GENERATION</span>
                                        </div>
                                        <span className="text-xs text-indigo-600 font-medium">{stagedProductAssets.length}/{MAX_PRODUCT_ASSET_SLOTS}</span>
                                    </div>
                                    <div className="p-4 space-y-3 bg-white">
                                        <p className="text-xs text-gray-500">
                                            Upload product images (shoes, products, packaging…). These are used as visual references during AI image generation. Each asset requires a name — this becomes its <strong>@tag</strong> in AI Mode.
                                        </p>

                                        {/* Staged product assets */}
                                        {stagedProductAssets.map(staged => (
                                            <div key={staged.id} className="flex items-center gap-3 bg-indigo-50 rounded-xl p-3 border border-indigo-100">
                                                <img src={staged.preview} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0 border border-indigo-200" />
                                                <div className="flex-1 min-w-0 space-y-1">
                                                    <input
                                                        className="w-full border border-gray-200 rounded-md px-2 py-1 text-xs focus:ring-1 focus:ring-indigo-400 outline-none"
                                                        placeholder="Asset name (e.g. Nike Hypervenom Neon Pink)"
                                                        value={assetNames[staged.id] ?? ''}
                                                        onChange={e => setAssetNames(prev => ({ ...prev, [staged.id]: e.target.value }))}
                                                    />
                                                    {assetNames[staged.id] && (
                                                        <p className="text-[10px] text-indigo-500 font-mono">
                                                            @{assetNames[staged.id].trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '')}
                                                        </p>
                                                    )}
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setStagedProductAssets(prev => prev.filter(s => s.id !== staged.id));
                                                        setAssetNames(prev => { const n = { ...prev }; delete n[staged.id]; return n; });
                                                    }}
                                                    className="text-red-400 hover:text-red-600 p-1 rounded-md hover:bg-red-50"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}

                                        {/* Upload slot */}
                                        {stagedProductAssets.length < MAX_PRODUCT_ASSET_SLOTS && (
                                            <div
                                                onClick={() => productAssetInputRef.current?.click()}
                                                className="border-2 border-dashed border-indigo-200 rounded-xl p-4 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors"
                                            >
                                                <Upload className="w-5 h-5 text-indigo-400 mx-auto mb-1" />
                                                <p className="text-xs text-indigo-600 font-medium">Click to upload product asset</p>
                                                <p className="text-[10px] text-gray-400 mt-0.5">PNG, JPG, WEBP</p>
                                            </div>
                                        )}
                                        <input
                                            ref={productAssetInputRef}
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={e => {
                                                const f = e.target.files?.[0];
                                                if (f) stageFile(f, 'product_asset', setStagedProductAssets);
                                                e.target.value = '';
                                            }}
                                        />
                                    </div>
                                </div>

                                {/* ══ Logos / Trademarks Section ══════════════════════ */}
                                <div className="border border-orange-200 rounded-xl overflow-hidden">
                                    <div className="px-4 py-3 bg-orange-50 border-b border-orange-100 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Shield className="w-4 h-4 text-orange-600" />
                                            <span className="text-sm font-semibold text-orange-900">Logos / Trademarks</span>
                                            <span className="text-[10px] bg-orange-200 text-orange-800 px-1.5 py-0.5 rounded-full font-semibold">OVERLAY ONLY — NOT IN GENERATION</span>
                                        </div>
                                        <span className="text-xs text-orange-600 font-medium">{stagedLogoAssets.length}/{MAX_LOGO_SLOTS}</span>
                                    </div>
                                    <div className="p-4 space-y-3 bg-white">
                                        <p className="text-xs text-gray-500">
                                            Upload your brand logo or trademark. <strong>These are never sent to the AI image model.</strong> They are composited onto the final image after generation is complete.
                                        </p>

                                        {/* Staged logo assets */}
                                        {stagedLogoAssets.map(staged => (
                                            <div key={staged.id} className="flex items-center gap-3 bg-orange-50 rounded-xl p-3 border border-orange-100">
                                                <img src={staged.preview} alt="" className="w-14 h-14 rounded-lg object-contain shrink-0 border border-orange-200 bg-white p-1" />
                                                <div className="flex-1 min-w-0 space-y-1">
                                                    <input
                                                        className="w-full border border-gray-200 rounded-md px-2 py-1 text-xs focus:ring-1 focus:ring-orange-400 outline-none"
                                                        placeholder="Logo name (e.g. Nike Trademark)"
                                                        value={assetNames[staged.id] ?? ''}
                                                        onChange={e => setAssetNames(prev => ({ ...prev, [staged.id]: e.target.value }))}
                                                    />
                                                    {assetNames[staged.id] && (
                                                        <p className="text-[10px] text-orange-500 font-mono">
                                                            @{assetNames[staged.id].trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '')}
                                                        </p>
                                                    )}
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setStagedLogoAssets(prev => prev.filter(s => s.id !== staged.id));
                                                        setAssetNames(prev => { const n = { ...prev }; delete n[staged.id]; return n; });
                                                    }}
                                                    className="text-red-400 hover:text-red-600 p-1 rounded-md hover:bg-red-50"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}

                                        {/* Upload slot */}
                                        {stagedLogoAssets.length < MAX_LOGO_SLOTS && (
                                            <div
                                                onClick={() => logoAssetInputRef.current?.click()}
                                                className="border-2 border-dashed border-orange-200 rounded-xl p-4 text-center cursor-pointer hover:border-orange-400 hover:bg-orange-50/50 transition-colors"
                                            >
                                                <Shield className="w-5 h-5 text-orange-400 mx-auto mb-1" />
                                                <p className="text-xs text-orange-600 font-medium">Click to upload logo / trademark</p>
                                                <p className="text-[10px] text-gray-400 mt-0.5">PNG with transparency recommended</p>
                                            </div>
                                        )}
                                        <input
                                            ref={logoAssetInputRef}
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={e => {
                                                const f = e.target.files?.[0];
                                                if (f) stageFile(f, 'logo_trademark', setStagedLogoAssets);
                                                e.target.value = '';
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Modal footer */}
                            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end bg-gray-50/50 shrink-0">
                                <button
                                    onClick={() => { setShowCreateModal(false); resetCreateModal(); }}
                                    className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleCreateKit}
                                    disabled={isCreating || !newKitName.trim() || !newKitGuidelines.trim()}
                                    className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
                                    {isCreating ? 'Creating…' : 'Create Product Kit'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
