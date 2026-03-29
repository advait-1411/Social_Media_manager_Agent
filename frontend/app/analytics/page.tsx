"use client"

import { useState, useEffect } from 'react';
import {
    TrendingUp, Users, Heart, MessageCircle,
    Eye, Share2, BarChart3, Calendar, ArrowUp, ArrowDown,
    Image as ImageIcon, Box, LayoutGrid
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { analyticsApi } from '@/lib/api';
import { subDays, isAfter, parseISO, format } from 'date-fns';

export default function AnalyticsPage() {
    const [dateRange, setDateRange] = useState('all');
    const [posts, setPosts] = useState<any[]>([]);
    const [assets, setAssets] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        setIsLoading(true);
        Promise.all([
            analyticsApi.getPosts(),
            analyticsApi.getAssets()
        ])
        .then(([pData, aData]) => {
            // Note: DB returns arrays directly or inside objects depending on the route, assume array for now based on prompt.
            setPosts(Array.isArray(pData) ? pData : []);
            setAssets(Array.isArray(aData) ? aData : []);
        })
        .catch(err => console.error("Failed to fetch analytics", err))
        .finally(() => setIsLoading(false));
    }, []);

    const now = new Date();
    const daysToSubtract = dateRange === '7d' ? 7 : (dateRange === '30d' ? 30 : null);
    const cutoffDate = daysToSubtract ? subDays(now, daysToSubtract) : null;

    const filteredPosts = posts.filter(p => !cutoffDate || (p.created_at && isAfter(parseISO(p.created_at), cutoffDate)));
    const filteredAssets = assets.filter(a => !cutoffDate || (a.created_at && isAfter(parseISO(a.created_at), cutoffDate)));

    // Top row
    const totalPosts = filteredPosts.length;
    const published = filteredPosts.filter(p => p.status === 'published').length;
    const scheduled = filteredPosts.filter(p => p.status === 'scheduled').length;
    const drafts = filteredPosts.filter(p => p.status === 'draft').length;

    // Second row
    const imagesGenerated = filteredAssets.filter(a => a.meta_data?.source === 'generated').length;
    const assetsUploaded = filteredAssets.filter(a => a.meta_data?.source === 'upload').length;
    const totalAssets = filteredAssets.length;
    const avgAssetsPerPost = filteredPosts.length > 0 
        ? (filteredPosts.reduce((acc, p) => acc + (p.media_assets?.length || 0), 0) / filteredPosts.length).toFixed(1)
        : '0.0';

    // Posts over time chart
    const chartDays = daysToSubtract || 30; // Default to last 30 days for visual
    const dates = Array.from({ length: chartDays }).map((_, i) => format(subDays(now, chartDays - 1 - i), 'yyyy-MM-dd'));

    const postsByDate = filteredPosts.reduce((acc, p) => {
        if (!p.created_at) return acc;
        const d = p.created_at.substring(0, 10);
        acc[d] = (acc[d] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    const chartData = dates.map(d => ({
        date: format(parseISO(d), 'MMM d'),
        count: postsByDate[d] || 0
    }));
    const maxCount = Math.max(...chartData.map(d => d.count), 1);

    // Status Breakdown
    const statusData = [
        { label: 'Drafts', value: drafts, color: 'bg-gray-400' },
        { label: 'Scheduled', value: scheduled, color: 'bg-blue-500' },
        { label: 'Published', value: published, color: 'bg-green-500' }
    ].filter(d => d.value > 0);

    const maxStatusVal = Math.max(...statusData.map(d => d.value), 1);

    // Platform Breakdown
    const platformCounts = filteredPosts.reduce((acc, p) => {
        if (!p.channels || p.channels.length === 0) {
            acc['Unassigned'] = (acc['Unassigned'] || 0) + 1;
        } else {
            p.channels.forEach((c: any) => {
                const plat = c.platform || 'Unknown';
                acc[plat] = (acc[plat] || 0) + 1;
            });
        }
        return acc;
    }, {} as Record<string, number>);

    const pltfDisplayNames: Record<string, string> = { instagram: 'Instagram', linkedin: 'LinkedIn', twitter: 'Twitter', Unassigned: 'Unassigned' };
    const platformData = Object.keys(platformCounts).map(platKey => ({
        label: pltfDisplayNames[platKey] || platKey,
        value: platformCounts[platKey]
    })).sort((a,b) => b.value - a.value);

    const maxPlatformVal = Math.max(...platformData.map(d => d.value), 1);

    if (isLoading) {
        return (
            <div className="space-y-6 animate-pulse p-2">
                <div className="h-10 bg-gray-200 rounded w-1/4"></div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[...Array(8)].map((_, i) => <div key={i} className="h-32 bg-gray-200 rounded-xl"></div>)}
                </div>
                <div className="h-64 bg-gray-200 rounded-xl"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
                    <p className="text-gray-500 text-sm">Track your content metrics from the database.</p>
                </div>
                <div className="flex gap-2 bg-white border border-gray-200 rounded-lg p-1 shadow-sm">
                    {[{id: '7d', label: 'Last 7 Days'}, {id: '30d', label: 'Last 30 Days'}, {id: 'all', label: 'All Time'}].map(range => (
                        <button
                            key={range.id}
                            onClick={() => setDateRange(range.id)}
                            className={cn(
                                "px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                                dateRange === range.id
                                    ? "bg-blue-50 text-blue-700"
                                    : "text-gray-500 hover:text-gray-700"
                            )}
                        >
                            {range.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Top Row Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: 'Total Posts', value: totalPosts, icon: BarChart3, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                    { label: 'Published', value: published, icon: Share2, color: 'text-green-600', bg: 'bg-green-50' },
                    { label: 'Scheduled', value: scheduled, icon: Calendar, color: 'text-blue-600', bg: 'bg-blue-50' },
                    { label: 'Drafts', value: drafts, icon: Box, color: 'text-gray-600', bg: 'bg-gray-100' },
                ].map((stat, i) => (
                    <motion.div key={stat.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                        <div className="flex items-center justify-between mb-3">
                            <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", stat.bg)}>
                                <stat.icon className={cn("w-5 h-5", stat.color)} />
                            </div>
                        </div>
                        <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                        <p className="text-xs text-gray-500 mt-1">{stat.label}</p>
                    </motion.div>
                ))}
            </div>

            {/* Second Row Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: 'Images Generated', value: imagesGenerated, icon: ImageIcon, color: 'text-purple-600', bg: 'bg-purple-50' },
                    { label: 'Assets Uploaded', value: assetsUploaded, icon: ArrowUp, color: 'text-orange-600', bg: 'bg-orange-50' },
                    { label: 'Total Assets', value: totalAssets, icon: LayoutGrid, color: 'text-blue-600', bg: 'bg-blue-50' },
                    { label: 'Avg Assets/Post', value: avgAssetsPerPost, icon: TrendingUp, color: 'text-pink-600', bg: 'bg-pink-50' },
                ].map((stat, i) => (
                    <motion.div key={stat.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + (i * 0.05) }} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                        <div className="flex items-center justify-between mb-3">
                            <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", stat.bg)}>
                                <stat.icon className={cn("w-5 h-5", stat.color)} />
                            </div>
                        </div>
                        <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                        <p className="text-xs text-gray-500 mt-1">{stat.label}</p>
                    </motion.div>
                ))}
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Posts over time Chart */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="font-semibold text-gray-900">Posts Over Time (Last {chartDays} days)</h2>
                    </div>
                    <div className="h-56 relative border-b border-gray-100 flex items-end justify-between px-2 pb-2">
                        {chartData.map((d, i) => {
                            const hPct = maxCount > 0 ? (d.count / maxCount) * 100 : 0;
                            return (
                                <div key={i} className="flex flex-col items-center justify-end h-full flex-1 group">
                                    <div className="w-full max-w-[12px] md:max-w-[20px] bg-blue-100 rounded-t-sm group-hover:bg-blue-300 relative" style={{ height: `${Math.max(1, hPct)}%` }}>
                                        {d.count > 0 && <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] bg-black text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100">{d.count}</span>}
                                    </div>
                                    {/* Sparse X-axis labels to avoid crowding if 30 days */}
                                    { (chartDays === 7 || i % 4 === 0 || i === chartDays - 1) ? (
                                        <span className="text-[9px] text-gray-400 absolute -bottom-5 transform truncate">{d.date}</span>
                                    ) : null }
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Breakdowns */}
                <div className="flex flex-col gap-6">
                    
                    {/* Status Breakdown */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 flex-1">
                        <h2 className="font-semibold text-gray-900 mb-6">Status Breakdown</h2>
                        {statusData.length > 0 ? (
                            <div className="space-y-4">
                                {statusData.map(d => (
                                    <div key={d.label}>
                                        <div className="flex justify-between text-sm mb-1">
                                            <span className="text-gray-600">{d.label}</span>
                                            <span className="font-medium">{d.value}</span>
                                        </div>
                                        <div className="w-full bg-gray-100 rounded-full h-2">
                                            <div className={cn("h-2 rounded-full", d.color)} style={{ width: `${(d.value / maxStatusVal) * 100}%` }}></div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center text-gray-400 text-sm mt-8">No data available</div>
                        )}
                    </div>

                    {/* Platform Breakdown */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 flex-1">
                        <h2 className="font-semibold text-gray-900 mb-6">Platform Distribution</h2>
                        {platformData.length > 0 ? (
                            <div className="space-y-4">
                                {platformData.map(d => (
                                    <div key={d.label}>
                                        <div className="flex justify-between text-sm mb-1">
                                            <span className="text-gray-600">{d.label}</span>
                                            <span className="font-medium">{d.value}</span>
                                        </div>
                                        <div className="w-full bg-gray-100 rounded-full h-2">
                                            <div className="h-2 rounded-full bg-indigo-500" style={{ width: `${(d.value / maxPlatformVal) * 100}%` }}></div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center text-gray-400 text-sm mt-8">No data available</div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}
