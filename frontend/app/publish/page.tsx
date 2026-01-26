"use client"

import { useState } from 'react';
import { Calendar as CalendarIcon, List, Clock, MoreHorizontal, Instagram, Linkedin, CheckCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { format, addDays, startOfWeek } from 'date-fns';

export default function PublishPage() {
    const [view, setView] = useState<'calendar' | 'list'>('calendar');
    const [currentDate, setCurrentDate] = useState(new Date());

    // Mock scheduled posts
    const posts = [
        { id: 1, title: "Product Launch Teaser", time: "10:00 AM", platform: "instagram", status: "scheduled", dayOffset: 1 },
        { id: 2, title: "Hiring Announcement", time: "02:00 PM", platform: "linkedin", status: "draft", dayOffset: 2 },
        { id: 3, title: "Customer Spotlight", time: "09:00 AM", platform: "instagram", status: "published", dayOffset: -1 },
    ];

    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));

    return (
        <div className="space-y-6 h-[calc(100vh-140px)] flex flex-col">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Publishing</h1>
                    <p className="text-gray-500 text-sm">Schedule and manage your content calendar.</p>
                </div>
                <div className="flex bg-white rounded-lg p-1 border border-gray-200 shadow-sm">
                    <button
                        onClick={() => setView('calendar')}
                        className={cn("px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2", view === 'calendar' ? "bg-blue-50 text-blue-700 shadow-sm" : "text-gray-500 hover:text-gray-700")}
                    >
                        <CalendarIcon className="w-4 h-4" /> Calendar
                    </button>
                    <button
                        onClick={() => setView('list')}
                        className={cn("px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2", view === 'list' ? "bg-blue-50 text-blue-700 shadow-sm" : "text-gray-500 hover:text-gray-700")}
                    >
                        <List className="w-4 h-4" /> Queue
                    </button>
                </div>
            </div>

            {/* Calendar View */}
            {view === 'calendar' && (
                <div className="flex-1 bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col overflow-hidden">
                    {/* Week Header */}
                    <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50/50">
                        {weekDays.map((day) => {
                            const isToday = format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
                            return (
                                <div key={day.toString()} className={cn("p-4 text-center border-r border-gray-100 last:border-r-0", isToday && "bg-blue-50/30")}>
                                    <span className="block text-xs font-semibold text-gray-400 uppercase">{format(day, 'EEE')}</span>
                                    <span className={cn("block text-lg font-medium mt-1", isToday ? "text-blue-600" : "text-gray-700")}>
                                        {format(day, 'd')}
                                    </span>
                                </div>
                            );
                        })}
                    </div>

                    {/* Calendar Body (Mock Time Slots) */}
                    <div className="grid grid-cols-7 flex-1 overflow-y-auto min-h-[500px]">
                        {weekDays.map((day, i) => {
                            const todayIndex = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
                            const dayPosts = posts.filter(p => i === (todayIndex + p.dayOffset + 7) % 7);

                            return (
                                <div key={i} className="border-r border-gray-100 p-2 space-y-2 min-h-[200px] hover:bg-gray-50/30 transition-colors relative group">
                                    <button className="absolute inset-0 w-full h-full opacity-0 group-hover:opacity-100 flex items-center justify-center pointer-events-none">
                                        <div className="bg-blue-50 text-blue-600 px-3 py-1 rounded-full text-xs font-semibold shadow-sm pointer-events-auto cursor-pointer hover:bg-blue-100">+ Schedule</div>
                                    </button>

                                    {dayPosts.map(post => (
                                        <div key={post.id} className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm hover:shadow-md transition-all cursor-pointer border-l-4 border-l-blue-500 z-10 relative">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-1.5">
                                                    {post.platform === 'instagram' ? <Instagram className="w-3.5 h-3.5 text-pink-600" /> : <Linkedin className="w-3.5 h-3.5 text-blue-700" />}
                                                    <span className="text-xs font-medium text-gray-500">{post.time}</span>
                                                </div>
                                                {post.status === 'published' && <CheckCircle className="w-3.5 h-3.5 text-green-500" />}
                                            </div>
                                            <p className="text-sm font-medium text-gray-800 line-clamp-2">{post.title}</p>
                                        </div>
                                    ))}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* List View */}
            {view === 'list' && (
                <div className="flex-1 bg-white border border-gray-200 rounded-xl shadow-sm p-6">
                    <div className="space-y-4">
                        {posts.map(post => (
                            <div key={post.id} className="flex items-center gap-4 p-4 border border-gray-100 rounded-lg hover:shadow-md transition-all">
                                <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center">
                                    {post.platform === 'instagram' ? <Instagram className="w-6 h-6 text-pink-500" /> : <Linkedin className="w-6 h-6 text-blue-600" />}
                                </div>
                                <div className="flex-1">
                                    <h3 className="font-medium text-gray-900">{post.title}</h3>
                                    <p className="text-sm text-gray-500">{post.time} • {post.status}</p>
                                </div>
                                <button className="p-2 hover:bg-gray-100 rounded-md">
                                    <MoreHorizontal className="w-4 h-4 text-gray-400" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
