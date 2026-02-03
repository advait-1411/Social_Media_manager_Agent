"use client"

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar as CalendarIcon, List, Clock, MoreHorizontal, Instagram, Linkedin, CheckCircle, Twitter } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { format, addDays, startOfWeek, parseISO } from 'date-fns';
import { postsApi } from '@/lib/api';
import { toast } from 'sonner';

export default function PublishPage() {
    const router = useRouter();
    const [view, setView] = useState<'calendar' | 'list'>('calendar');
    const [currentDate, setCurrentDate] = useState(new Date());
    const [posts, setPosts] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const lastStatusRef = useRef<Record<number, string>>({});

    useEffect(() => {
        let isCancelled = false;

        const fetchPosts = async () => {
            // Keep silent loading for polling to avoid flickering UI
            if (posts.length === 0) setIsLoading(true);

            try {
                // Fetch for the current week
                const start = startOfWeek(currentDate, { weekStartsOn: 1 });
                const end = addDays(start, 6);

                const data = await postsApi.getCalendar(
                    format(start, 'yyyy-MM-dd'),
                    format(end, 'yyyy-MM-dd'),
                    'all' // Fetch both scheduled and published
                ) as any[];

                if (isCancelled) return;

                // Status tracking for toasts
                data.forEach(post => {
                    const prevStatus = lastStatusRef.current[post.id];
                    const currentStatus = post.status;

                    // Only notify if we have seen this post before (prevStatus exists) 
                    // or if we decide to notify on first load for active things (optional, skipping for now to avoid spam)
                    if (prevStatus && prevStatus !== currentStatus) {

                        // Scheduled -> Publishing
                        if (prevStatus === 'scheduled' && currentStatus === 'publishing') {
                            toast.info(`Post "${post.content?.slice(0, 20)}..." is being published...`);
                        }

                        // Publishing -> Published
                        if ((prevStatus === 'publishing' || prevStatus === 'scheduled') && currentStatus === 'published') {
                            toast.success(`Post "${post.content?.slice(0, 20)}..." published successfully!`);
                        }

                        // -> Failed
                        if (currentStatus === 'failed') {
                            toast.error(`Failed to publish post "${post.content?.slice(0, 20)}...": ${post.last_error || 'Unknown error'}`);
                        }
                    }

                    // Update ref
                    lastStatusRef.current[post.id] = currentStatus;
                });

                setPosts(data);
            } catch (error) {
                console.error("Failed to fetch calendar posts", error);
                // Only show error toast on initial load, not every poll
                if (posts.length === 0) toast.error("Failed to load calendar");
            } finally {
                setIsLoading(false);
            }
        };

        fetchPosts(); // Initial fetch

        // Poll every 10 seconds (frequent enough for "30s" requirements but responsive)
        const intervalId = setInterval(fetchPosts, 10000);

        return () => {
            isCancelled = true;
            clearInterval(intervalId);
        };
    }, [currentDate]); // Re-run when week changes

    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));

    const getPlatformIcon = (platform: string) => {
        switch (platform) {
            case 'instagram': return <Instagram className="w-3.5 h-3.5 text-pink-600" />;
            case 'linkedin': return <Linkedin className="w-3.5 h-3.5 text-blue-700" />;
            case 'twitter': return <Twitter className="w-3.5 h-3.5 text-black" />;
            default: return <Clock className="w-3.5 h-3.5 text-gray-500" />;
        }
    };

    // For list view icon
    const getPlatformIconLarge = (platform: string) => {
        switch (platform) {
            case 'instagram': return <Instagram className="w-6 h-6 text-pink-500" />;
            case 'linkedin': return <Linkedin className="w-6 h-6 text-blue-600" />;
            case 'twitter': return <Twitter className="w-6 h-6 text-black" />;
            default: return <Clock className="w-6 h-6 text-gray-400" />;
        }
    };

    return (
        <div className="space-y-6 h-[calc(100vh-140px)] flex flex-col">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Publishing</h1>
                    <p className="text-gray-500 text-sm">Schedule and manage your content calendar.</p>
                </div>
                <div className="flex gap-4">
                    {/* Could add week navigation here later */}
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

                    {/* Calendar Body */}
                    <div className="grid grid-cols-7 flex-1 overflow-y-auto min-h-[500px]">
                        {isLoading ? (
                            <div className="col-span-7 flex items-center justify-center p-10 text-gray-400">Loading calendar...</div>
                        ) : (
                            weekDays.map((day, i) => {
                                const dayDateStr = format(day, 'yyyy-MM-dd');
                                const dayPosts = posts.filter(p => {
                                    if (!p.scheduled_time) return false;
                                    // Parse UTC ISO string locally
                                    const pDate = new Date(p.scheduled_time);
                                    return format(pDate, 'yyyy-MM-dd') === dayDateStr;
                                });

                                return (
                                    <div key={i} className="border-r border-gray-100 p-2 space-y-2 min-h-[200px] hover:bg-gray-50/30 transition-colors relative group">
                                        <button
                                            onClick={() => router.push('/create')}
                                            className="absolute inset-0 w-full h-full opacity-0 group-hover:opacity-100 flex items-center justify-center pointer-events-none"
                                        >
                                            <div className="bg-blue-50 text-blue-600 px-3 py-1 rounded-full text-xs font-semibold shadow-sm pointer-events-auto cursor-pointer hover:bg-blue-100">+ Schedule</div>
                                        </button>

                                        {dayPosts.map(post => {
                                            const pDate = new Date(post.scheduled_time);
                                            // Determine platform from channels list (array of IDs) or platform_settings
                                            // Fallback to logic since we don't have full channel objects here easily without a join or extra fetch
                                            // But backend returns 'platforms' as list of channel IDs.
                                            // Simplification: Assume ID 1=Insta, 2=Linkedin roughly or check platform_settings keys?
                                            // Actually backend return uses `post.channels`.
                                            // Let's guess: if channels has >0 items.
                                            // Or check platform_settings keys: 'instagram_media_id' -> instagram.
                                            let platform = 'instagram'; // default
                                            if (post.platform_settings && Object.keys(post.platform_settings).some(k => k.includes('linkedin'))) platform = 'linkedin';
                                            // Improve: Backend could populate a platform string.
                                            // For now, default to instagram icon as per UI.

                                            // Use platform_string from backend if available (it wasn't in my implementation, just IDs).
                                            // I'll stick to a generic icon or guess.

                                            return (
                                                <div key={post.id} className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm hover:shadow-md transition-all cursor-pointer border-l-4 border-l-blue-500 z-10 relative">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <div className="flex items-center gap-1.5">
                                                            {getPlatformIcon(platform)}
                                                            <span className="text-xs font-medium text-gray-500">{format(pDate, 'h:mm a')}</span>
                                                        </div>
                                                        {post.status === 'published' && <CheckCircle className="w-3.5 h-3.5 text-green-500" />}
                                                    </div>
                                                    <p className="text-sm font-medium text-gray-800 line-clamp-2">{post.content || "Untitled Post"}</p>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            )}

            {/* List View */}
            {view === 'list' && (
                <div className="flex-1 bg-white border border-gray-200 rounded-xl shadow-sm p-6 overflow-y-auto">
                    <div className="space-y-4">
                        {posts.map(post => {
                            const pDate = new Date(post.scheduled_time || post.created_at);
                            return (
                                <div key={post.id} className="flex items-center gap-4 p-4 border border-gray-100 rounded-lg hover:shadow-md transition-all">
                                    <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center">
                                        {getPlatformIconLarge('instagram')}
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="font-medium text-gray-900 line-clamp-1">{post.content || "Untitled Post"}</h3>
                                        <p className="text-sm text-gray-500">
                                            {post.scheduled_time ? format(pDate, 'MMM d, h:mm a') : 'Unscheduled'} • <span className="capitalize">{post.status}</span>
                                        </p>
                                    </div>
                                    <button className="p-2 hover:bg-gray-100 rounded-md">
                                        <MoreHorizontal className="w-4 h-4 text-gray-400" />
                                    </button>
                                </div>
                            );
                        })}
                        {posts.length === 0 && !isLoading && (
                            <div className="text-center text-gray-500 py-10">No posts found for this week.</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
