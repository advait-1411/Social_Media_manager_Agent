"use client"

import { useState, useEffect, useRef, useCallback } from 'react';
import {
    Instagram, Linkedin, Twitter, Globe, Plus,
    Check, AlertCircle, Settings2, Clock, Trash2, RefreshCw,
    Palette, Save, Upload, X, ChevronRight, Loader2, ChevronDown, ImageIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

interface Channel {
    id: number;
    platform: string;
    name: string;
    is_active: boolean;
    credentials: { user_id: string; access_token: string };
}

interface BrandKit {
    id: number;
    name: string;
    description: string | null;
    system_prompt: string;
    logo_light_path: string | null;
    logo_dark_path: string | null;
    is_default: boolean;
    created_at: string;
    asset_count: number;
}

const PLATFORMS = [
    { id: 'instagram', name: 'Instagram', icon: Instagram, color: 'bg-gradient-to-br from-purple-500 to-pink-500', available: true },
    { id: 'linkedin', name: 'LinkedIn', icon: Linkedin, color: 'bg-blue-600', available: false },
    { id: 'twitter', name: 'X / Twitter', icon: Twitter, color: 'bg-black', available: false },
];

const API = 'http://localhost:8000';

export default function SettingsPage() {
    const [channels, setChannels] = useState<Channel[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('channels');

    // Brand Kit state
    const [kits, setKits] = useState<BrandKit[]>([]);
    const [selectedKit, setSelectedKit] = useState<BrandKit | null>(null);
    const [kitsLoading, setKitsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Editable fields (controlled)
    const [editName, setEditName] = useState('');
    const [editDesc, setEditDesc] = useState('');
    const [editPrompt, setEditPrompt] = useState('');

    // Logo previews
    const [lightPreview, setLightPreview] = useState<string | null>(null);
    const [darkPreview, setDarkPreview] = useState<string | null>(null);
    const [isUploadingLogo, setIsUploadingLogo] = useState(false);
    const lightInputRef = useRef<HTMLInputElement>(null);
    const darkInputRef = useRef<HTMLInputElement>(null);

    // New Kit modal
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newKitName, setNewKitName] = useState('');
    const [newKitDesc, setNewKitDesc] = useState('');
    const [newKitPrompt, setNewKitPrompt] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    // Staged logos for Create modal
    const [newLogoLight, setNewLogoLight] = useState<File | null>(null);
    const [newLogoDark, setNewLogoDark] = useState<File | null>(null);
    const [newBrandImages, setNewBrandImages] = useState<File[]>([]);
    const [newLightPreview, setNewLightPreview] = useState<string | null>(null);
    const [newDarkPreview, setNewDarkPreview] = useState<string | null>(null);
    const [showBrandAssets, setShowBrandAssets] = useState(false);
    const newLightRef = useRef<HTMLInputElement>(null);
    const newDarkRef = useRef<HTMLInputElement>(null);
    const newBrandRef = useRef<HTMLInputElement>(null);

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
            const res = await fetch(`${API}/api/brand-kits/`);
            if (res.ok) {
                const data: BrandKit[] = await res.json();
                setKits(data);
                // Select default kit on first load
                const def = data.find(k => k.is_default) ?? data[0] ?? null;
                if (def && !selectedKit) loadKit(def);
            }
        } catch (e) {
            toast.error('Failed to load brand kits');
        } finally {
            setKitsLoading(false);
        }
    };

    const loadKit = (kit: BrandKit) => {
        setSelectedKit(kit);
        setEditName(kit.name);
        setEditDesc(kit.description ?? '');
        setEditPrompt(kit.system_prompt);
        setLightPreview(kit.logo_light_path ? `${API}/${kit.logo_light_path.replace(/^\.?\//, '')}` : null);
        setDarkPreview(kit.logo_dark_path ? `${API}/${kit.logo_dark_path.replace(/^\.?\//, '')}` : null);
    };

    const resetCreateModal = () => {
        setNewKitName('');
        setNewKitDesc('');
        setNewKitPrompt('');
        setNewLogoLight(null);
        setNewLogoDark(null);
        setNewBrandImages([]);
        setNewLightPreview(null);
        setNewDarkPreview(null);
        setShowBrandAssets(false);
    };

    useEffect(() => { fetchChannels(); }, []);
    useEffect(() => {
        if (activeTab === 'brand') fetchKits();
    }, [activeTab]);

    const handleSaveKit = async () => {
        if (!selectedKit) return;
        setIsSaving(true);
        try {
            const res = await fetch(`${API}/api/brand-kits/${selectedKit.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: editName, description: editDesc, system_prompt: editPrompt }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({ detail: res.statusText }));
                throw new Error(err.detail || 'Save failed');
            }
            const updated: BrandKit = await res.json();
            setKits(prev => prev.map(k => k.id === updated.id ? updated : k));
            setSelectedKit(updated);
            toast.success('Brand kit saved!');
        } catch (err: any) {
            toast.error(err.message || 'Failed to save');
        } finally {
            setIsSaving(false);
        }
    };

    const handleLogoUpload = async (type: 'light' | 'dark', file: File) => {
        if (!selectedKit) return;
        setIsUploadingLogo(true);
        try {
            const fd = new FormData();
            fd.append(type === 'light' ? 'logo_light' : 'logo_dark', file);
            const res = await fetch(`${API}/api/brand-kits/${selectedKit.id}/logo`, {
                method: 'POST',
                body: fd,
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({ detail: res.statusText }));
                throw new Error(err.detail || 'Upload failed');
            }
            const updated: BrandKit = await res.json();
            setKits(prev => prev.map(k => k.id === updated.id ? updated : k));
            setSelectedKit(updated);
            // Update preview
            const previewUrl = URL.createObjectURL(file);
            if (type === 'light') setLightPreview(previewUrl);
            else setDarkPreview(previewUrl);
            toast.success(`${type === 'light' ? 'Light' : 'Dark'} logo uploaded!`);
        } catch (err: any) {
            toast.error(err.message || 'Upload failed');
        } finally {
            setIsUploadingLogo(false);
        }
    };

    const handleCreateKit = async () => {
        if (!newKitName.trim() || !newKitPrompt.trim()) {
            toast.error('Name and System Prompt are required.');
            return;
        }
        setIsCreating(true);
        try {
            // 1. Create the kit
            const res = await fetch(`${API}/api/brand-kits/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newKitName.trim(), description: newKitDesc.trim() || null, system_prompt: newKitPrompt.trim() }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({ detail: res.statusText }));
                throw new Error(err.detail || 'Create failed');
            }
            let created: BrandKit = await res.json();

            // 2. Upload staged logos if any
            const hasLogos = newLogoLight || newLogoDark;
            if (hasLogos) {
                const fd = new FormData();
                if (newLogoLight) fd.append('logo_light', newLogoLight);
                if (newLogoDark) fd.append('logo_dark', newLogoDark);
                const logoRes = await fetch(`${API}/api/brand-kits/${created.id}/logo`, {
                    method: 'POST',
                    body: fd,
                });
                if (logoRes.ok) created = await logoRes.json();
            }

            setKits(prev => [...prev, created]);
            loadKit(created);
            setShowCreateModal(false);
            resetCreateModal();
            toast.success(`Kit "${created.name}" created!${hasLogos ? ' Logos uploaded.' : ''}`);
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
                        {tab}
                    </button>
                ))}
            </div>

            {activeTab === 'channels' && (
                <div className="space-y-6">
                    {/* Connected Channels */}
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

                    {/* Available Platforms */}
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
                                            <span className="absolute top-3 right-3 text-[10px] bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full font-medium">
                                                SOON
                                            </span>
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

            {/* ── Brand Tab ─────────────────────────────────────────────────────── */}
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
                                            <Palette className="w-4 h-4" />
                                            {kit.name}
                                            {kit.is_default && (
                                                <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded-full font-semibold">
                                                    DEFAULT
                                                </span>
                                            )}
                                            <span className="text-[10px] opacity-70">{kit.asset_count} assets</span>
                                        </button>
                                    ))}
                                    <button
                                        onClick={() => setShowCreateModal(true)}
                                        className="flex items-center gap-2 px-4 py-2 rounded-xl border border-dashed border-gray-300 text-sm font-medium text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition-all"
                                    >
                                        <Plus className="w-4 h-4" />
                                        New Kit
                                    </button>
                                </div>
                            )}

                            {/* Selected kit editor */}
                            {selectedKit ? (
                                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-6">
                                    <div className="flex items-center justify-between">
                                        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                                            <Palette className="w-4 h-4 text-indigo-600" />
                                            Brand Kit — {selectedKit.is_default ? 'Default' : 'Custom'}
                                        </h2>
                                        <button
                                            onClick={handleSaveKit}
                                            disabled={isSaving}
                                            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                                        >
                                            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                            {isSaving ? 'Saving…' : 'Save Changes'}
                                        </button>
                                    </div>

                                    {/* Name & Description */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Kit Name</label>
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

                                    {/* System Prompt */}
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">System Prompt</label>
                                        <textarea
                                            rows={10}
                                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-y"
                                            value={editPrompt}
                                            onChange={e => setEditPrompt(e.target.value)}
                                            placeholder="Visual brand constraints sent to the AI…"
                                        />
                                        <p className="text-xs text-gray-400 mt-1">{editPrompt.length} characters · This prompt is used for every image generated with this kit.</p>
                                    </div>

                                    {/* Logo Uploads */}
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Brand Logos</label>
                                        <div className="grid grid-cols-2 gap-4">
                                            {/* Light Logo */}
                                            <div>
                                                <p className="text-xs text-gray-500 mb-2">Light Version (for dark backgrounds)</p>
                                                <div
                                                    onClick={() => lightInputRef.current?.click()}
                                                    className={cn(
                                                        'relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors hover:border-indigo-400',
                                                        lightPreview ? 'border-indigo-300 bg-indigo-50/30' : 'border-gray-200 hover:bg-gray-50'
                                                    )}
                                                >
                                                    {lightPreview ? (
                                                        <img src={lightPreview} alt="Light logo" className="max-h-16 mx-auto object-contain" />
                                                    ) : (
                                                        <>
                                                            <Upload className="w-6 h-6 text-gray-300 mx-auto mb-1" />
                                                            <p className="text-xs text-gray-500">Upload Logo (Light)</p>
                                                        </>
                                                    )}
                                                    {isUploadingLogo && (
                                                        <div className="absolute inset-0 bg-white/70 flex items-center justify-center rounded-xl">
                                                            <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                                                        </div>
                                                    )}
                                                </div>
                                                <input
                                                    ref={lightInputRef}
                                                    type="file"
                                                    accept="image/*"
                                                    className="hidden"
                                                    onChange={e => {
                                                        const f = e.target.files?.[0];
                                                        if (f) handleLogoUpload('light', f);
                                                        e.target.value = '';
                                                    }}
                                                />
                                            </div>

                                            {/* Dark Logo */}
                                            <div>
                                                <p className="text-xs text-gray-500 mb-2">Dark Version (for light backgrounds)</p>
                                                <div
                                                    onClick={() => darkInputRef.current?.click()}
                                                    className={cn(
                                                        'relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors hover:border-indigo-400',
                                                        darkPreview ? 'border-indigo-300 bg-indigo-50/30' : 'border-gray-200 hover:bg-gray-50'
                                                    )}
                                                >
                                                    {darkPreview ? (
                                                        <img src={darkPreview} alt="Dark logo" className="max-h-16 mx-auto object-contain" />
                                                    ) : (
                                                        <>
                                                            <Upload className="w-6 h-6 text-gray-300 mx-auto mb-1" />
                                                            <p className="text-xs text-gray-500">Upload Logo (Dark)</p>
                                                        </>
                                                    )}
                                                    {isUploadingLogo && (
                                                        <div className="absolute inset-0 bg-white/70 flex items-center justify-center rounded-xl">
                                                            <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                                                        </div>
                                                    )}
                                                </div>
                                                <input
                                                    ref={darkInputRef}
                                                    type="file"
                                                    accept="image/*"
                                                    className="hidden"
                                                    onChange={e => {
                                                        const f = e.target.files?.[0];
                                                        if (f) handleLogoUpload('dark', f);
                                                        e.target.value = '';
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
                                    <Palette className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                                    <p className="text-gray-500 font-medium">No brand kits yet.</p>
                                    <button
                                        onClick={() => setShowCreateModal(true)}
                                        className="mt-4 bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
                                    >
                                        Create First Kit
                                    </button>
                                </div>
                            )}
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

            {/* ── Create New Kit Modal ──────────────────────────────────────────── */}
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
                            className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                        >
                            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                    <Palette className="w-5 h-5 text-indigo-600" />
                                    Create New Brand Kit
                                </h3>
                                <button onClick={() => setShowCreateModal(false)} className="p-1 hover:bg-gray-100 rounded-full">
                                    <X className="w-5 h-5 text-gray-400" />
                                </button>
                            </div>

                            <div className="p-6 space-y-4 overflow-y-auto flex-1">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Product Name *</label>
                                        <input
                                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                            placeholder="e.g. Summer Campaign"
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

                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">System Prompt *</label>
                                    <textarea
                                        rows={7}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none resize-y"
                                        placeholder="Paste your visual brand constraints here…"
                                        value={newKitPrompt}
                                        onChange={e => setNewKitPrompt(e.target.value)}
                                    />
                                    <p className="text-xs text-gray-400 mt-1">This prompt will be passed to the AI for every generation using this kit.</p>
                                </div>

                                {/* ── Brand Assets (optional) ─────────────────── */}
                                <div className="border border-gray-200 rounded-xl overflow-hidden">
                                    <button
                                        type="button"
                                        onClick={() => setShowBrandAssets(v => !v)}
                                        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-sm font-medium text-gray-700"
                                    >
                                        <div className="flex items-center gap-2">
                                            <ImageIcon className="w-4 h-4 text-indigo-500" />
                                            Brand Assets
                                            <span className="text-[10px] bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full font-semibold">OPTIONAL</span>
                                            {(newLogoLight || newLogoDark || newBrandImages.length > 0) && (
                                                <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-semibold">
                                                    {[newLogoLight, newLogoDark, ...newBrandImages].filter(Boolean).length} file(s) staged
                                                </span>
                                            )}
                                        </div>
                                        <ChevronDown className={cn('w-4 h-4 text-gray-400 transition-transform', showBrandAssets && 'rotate-180')} />
                                    </button>

                                    <AnimatePresence initial={false}>
                                        {showBrandAssets && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.2 }}
                                                className="overflow-hidden"
                                            >
                                                <div className="p-4 space-y-4 bg-white">
                                                    <p className="text-xs text-gray-500 leading-relaxed">
                                                        Upload your logos and trademarks. These will be stored with the kit and referenced in the system prompt so the AI is aware of your brand assets.
                                                    </p>

                                                    {/* Light + Dark logo row */}
                                                    <div className="grid grid-cols-2 gap-3">
                                                        {/* Logo Light */}
                                                        <div>
                                                            <p className="text-xs font-medium text-gray-600 mb-1.5">Logo — Light version</p>
                                                            <div
                                                                onClick={() => newLightRef.current?.click()}
                                                                className={cn(
                                                                    'relative border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors hover:border-indigo-400',
                                                                    newLightPreview ? 'border-indigo-300 bg-indigo-50/30' : 'border-gray-200 hover:bg-gray-50'
                                                                )}
                                                            >
                                                                {newLightPreview ? (
                                                                    <div className="relative">
                                                                        <img src={newLightPreview} alt="light" className="max-h-14 mx-auto object-contain" />
                                                                        <button
                                                                            type="button"
                                                                            onClick={e => { e.stopPropagation(); setNewLogoLight(null); setNewLightPreview(null); }}
                                                                            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600"
                                                                        >
                                                                            <X className="w-3 h-3" />
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <>
                                                                        <Upload className="w-5 h-5 text-gray-300 mx-auto mb-1" />
                                                                        <p className="text-xs text-gray-400">Click to upload</p>
                                                                    </>
                                                                )}
                                                            </div>
                                                            <input ref={newLightRef} type="file" accept="image/*" className="hidden" onChange={e => {
                                                                const f = e.target.files?.[0];
                                                                if (f) { setNewLogoLight(f); setNewLightPreview(URL.createObjectURL(f)); }
                                                                e.target.value = '';
                                                            }} />
                                                        </div>

                                                        {/* Logo Dark */}
                                                        <div>
                                                            <p className="text-xs font-medium text-gray-600 mb-1.5">Logo — Dark version</p>
                                                            <div
                                                                onClick={() => newDarkRef.current?.click()}
                                                                className={cn(
                                                                    'relative border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors hover:border-indigo-400',
                                                                    newDarkPreview ? 'border-indigo-300 bg-indigo-50/30' : 'border-gray-200 hover:bg-gray-50'
                                                                )}
                                                            >
                                                                {newDarkPreview ? (
                                                                    <div className="relative">
                                                                        <img src={newDarkPreview} alt="dark" className="max-h-14 mx-auto object-contain" />
                                                                        <button
                                                                            type="button"
                                                                            onClick={e => { e.stopPropagation(); setNewLogoDark(null); setNewDarkPreview(null); }}
                                                                            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600"
                                                                        >
                                                                            <X className="w-3 h-3" />
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <>
                                                                        <Upload className="w-5 h-5 text-gray-300 mx-auto mb-1" />
                                                                        <p className="text-xs text-gray-400">Click to upload</p>
                                                                    </>
                                                                )}
                                                            </div>
                                                            <input ref={newDarkRef} type="file" accept="image/*" className="hidden" onChange={e => {
                                                                const f = e.target.files?.[0];
                                                                if (f) { setNewLogoDark(f); setNewDarkPreview(URL.createObjectURL(f)); }
                                                                e.target.value = '';
                                                            }} />
                                                        </div>
                                                    </div>

                                                    {/* Auto-inject prompt hint */}
                                                    {(newLogoLight || newLogoDark) && (
                                                        <div className="flex items-start gap-2 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
                                                            <span className="text-indigo-500 mt-0.5">💡</span>
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-xs text-indigo-700 font-medium">Logo reference added to System Prompt</p>
                                                                <p className="text-[11px] text-indigo-500 mt-0.5">A brand logo note will be appended automatically so the AI is aware of your logo assets.</p>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    const logoNote = `\n\nBRAND LOGOS: This kit has ${[newLogoLight && 'a light logo', newLogoDark && 'a dark logo'].filter(Boolean).join(' and ')} uploaded. When generating images, ensure the brand logo area is kept clean and unobscured so the logo can be composited on top in post-production. Do not generate any logos or text that could conflict with the brand's actual logo.`;
                                                                    if (!newKitPrompt.includes('BRAND LOGOS:')) setNewKitPrompt(p => p + logoNote);
                                                                }}
                                                                className="text-[10px] bg-indigo-600 text-white px-2 py-1 rounded-md font-semibold hover:bg-indigo-700 whitespace-nowrap shrink-0"
                                                            >
                                                                Inject into Prompt
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </div>

                            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end bg-gray-50/50 shrink-0">
                                <button
                                    onClick={() => { setShowCreateModal(false); resetCreateModal(); }}
                                    className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleCreateKit}
                                    disabled={isCreating || !newKitName.trim() || !newKitPrompt.trim()}
                                    className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                    {isCreating ? 'Creating…' : 'Create Kit'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
