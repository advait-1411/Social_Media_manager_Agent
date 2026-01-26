"use client"

import { useState, useEffect } from 'react';
import {
    Instagram, Linkedin, Twitter, Globe, Plus,
    Check, AlertCircle, Settings2, Clock, Trash2, RefreshCw
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

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

export default function SettingsPage() {
    const [channels, setChannels] = useState<Channel[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('channels');

    const fetchChannels = async () => {
        try {
            const res = await fetch('http://localhost:8000/api/connectors/');
            if (res.ok) {
                const data = await res.json();
                setChannels(data);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchChannels();
    }, []);

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

            {activeTab === 'brand' && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                    <h2 className="font-semibold text-gray-900 mb-4">Brand Kit</h2>
                    <p className="text-gray-500 text-sm mb-6">Upload your logos and configure brand overlays.</p>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:border-blue-300 transition-colors cursor-pointer">
                            <Plus className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                            <p className="text-sm text-gray-600">Upload Logo (Light)</p>
                        </div>
                        <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:border-blue-300 transition-colors cursor-pointer">
                            <Plus className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                            <p className="text-sm text-gray-600">Upload Logo (Dark)</p>
                        </div>
                    </div>
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
        </div>
    );
}
