"use client"

import { useState } from 'react';
import {
    TrendingUp, Users, Heart, MessageCircle,
    Eye, Share2, BarChart3, Calendar, ArrowUp, ArrowDown
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

const MOCK_STATS = [
    { label: 'Total Reach', value: '24.5K', change: '+12.3%', up: true, icon: Eye },
    { label: 'Engagement', value: '3.2K', change: '+8.7%', up: true, icon: Heart },
    { label: 'Followers', value: '1,847', change: '+156', up: true, icon: Users },
    { label: 'Posts', value: '23', change: '7 this week', up: true, icon: BarChart3 },
];

const MOCK_POSTS = [
    { id: 1, title: 'Product Launch Teaser', likes: 342, comments: 28, shares: 15, reach: 4200 },
    { id: 2, title: 'Behind the Scenes', likes: 289, comments: 45, shares: 8, reach: 3100 },
    { id: 3, title: 'Customer Spotlight', likes: 456, comments: 67, shares: 23, reach: 5600 },
];

export default function AnalyticsPage() {
    const [dateRange, setDateRange] = useState('7d');

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
                    <p className="text-gray-500 text-sm">Track your social media performance.</p>
                </div>
                <div className="flex gap-2 bg-white border border-gray-200 rounded-lg p-1 shadow-sm">
                    {['7d', '30d', '90d'].map(range => (
                        <button
                            key={range}
                            onClick={() => setDateRange(range)}
                            className={cn(
                                "px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                                dateRange === range
                                    ? "bg-blue-50 text-blue-700"
                                    : "text-gray-500 hover:text-gray-700"
                            )}
                        >
                            {range === '7d' ? 'Week' : range === '30d' ? 'Month' : 'Quarter'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {MOCK_STATS.map((stat, i) => (
                    <motion.div
                        key={stat.label}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="bg-white rounded-xl border border-gray-200 shadow-sm p-5"
                    >
                        <div className="flex items-center justify-between mb-3">
                            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                                <stat.icon className="w-5 h-5 text-blue-600" />
                            </div>
                            <span className={cn(
                                "text-xs font-medium flex items-center gap-0.5",
                                stat.up ? "text-green-600" : "text-red-600"
                            )}>
                                {stat.up ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                                {stat.change}
                            </span>
                        </div>
                        <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                        <p className="text-xs text-gray-500 mt-1">{stat.label}</p>
                    </motion.div>
                ))}
            </div>

            {/* Chart Placeholder */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="font-semibold text-gray-900">Engagement Over Time</h2>
                    <select className="text-sm bg-transparent text-gray-600 outline-none">
                        <option>All Channels</option>
                        <option>Instagram</option>
                    </select>
                </div>

                {/* Mock Chart */}
                <div className="h-64 bg-gradient-to-t from-blue-50 to-transparent rounded-lg relative overflow-hidden">
                    <div className="absolute inset-0 flex items-end justify-around px-4 pb-4">
                        {[40, 65, 45, 80, 55, 70, 90].map((h, i) => (
                            <motion.div
                                key={i}
                                initial={{ height: 0 }}
                                animate={{ height: `${h}%` }}
                                transition={{ delay: i * 0.1, duration: 0.5 }}
                                className="w-8 bg-gradient-to-t from-blue-500 to-blue-400 rounded-t-md"
                            />
                        ))}
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 flex justify-around px-4 py-2 text-xs text-gray-400 border-t border-gray-100 bg-white/50">
                        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                            <span key={day}>{day}</span>
                        ))}
                    </div>
                </div>
            </div>

            {/* Top Posts Table */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h2 className="font-semibold text-gray-900">Top Performing Posts</h2>
                    <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">View all</button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                            <tr>
                                <th className="px-6 py-3 text-left font-medium">Post</th>
                                <th className="px-6 py-3 text-center font-medium">Reach</th>
                                <th className="px-6 py-3 text-center font-medium">Likes</th>
                                <th className="px-6 py-3 text-center font-medium">Comments</th>
                                <th className="px-6 py-3 text-center font-medium">Shares</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {MOCK_POSTS.map(post => (
                                <tr key={post.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-12 h-12 bg-gray-200 rounded-lg" />
                                            <span className="font-medium text-gray-900">{post.title}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-center text-gray-600">{post.reach.toLocaleString()}</td>
                                    <td className="px-6 py-4 text-center">
                                        <span className="inline-flex items-center gap-1 text-pink-600">
                                            <Heart className="w-3 h-3" /> {post.likes}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <span className="inline-flex items-center gap-1 text-blue-600">
                                            <MessageCircle className="w-3 h-3" /> {post.comments}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <span className="inline-flex items-center gap-1 text-green-600">
                                            <Share2 className="w-3 h-3" /> {post.shares}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
