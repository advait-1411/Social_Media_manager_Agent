import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, CheckCircle, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { useClickOutside } from '@/lib/hooks/use-click-outside';
import { useSocket } from '@/components/socket-provider';

interface Notification {
    id: number;
    title: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error';
    is_read: boolean;
    created_at: string;
    post_id?: number;
}

interface NotificationsPopoverProps {
    isOpen: boolean;
    onClose: () => void;
}

export function NotificationsPopover({ isOpen, onClose }: NotificationsPopoverProps) {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const { hasUnread, setHasUnread } = useSocket();
    const wrapperRef = useClickOutside(onClose);

    // Initial fetch
    useEffect(() => {
        if (isOpen) {
            fetchNotifications();
            // Clear unread indicator locally when opened
            setHasUnread(false);
        }
    }, [isOpen]);

    const fetchNotifications = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('http://localhost:8000/api/notifications/');
            if (res.ok) {
                const data = await res.json();
                setNotifications(data);
            }
        } catch (error) {
            console.error("Failed to fetch notifications", error);
        } finally {
            setIsLoading(false);
        }
    };

    const markAllRead = async () => {
        try {
            await fetch('http://localhost:8000/api/notifications/read-all', { method: 'POST' });
            // Update local state
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
            setHasUnread(false);
        } catch (error) {
            console.error("Failed to mark all read", error);
        }
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'success': return <CheckCircle className="w-4 h-4 text-green-500" />;
            case 'error': return <AlertCircle className="w-4 h-4 text-red-500" />;
            case 'warning': return <AlertCircle className="w-4 h-4 text-yellow-500" />;
            default: return <Info className="w-4 h-4 text-blue-500" />;
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    ref={wrapperRef}
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute top-16 right-6 w-80 bg-white rounded-xl shadow-2xl border border-gray-100 z-50 overflow-hidden flex flex-col"
                >
                    <div className="p-3 border-b flex items-center justify-between bg-gray-50/50">
                        <h3 className="font-semibold text-sm text-gray-800">Notifications</h3>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={markAllRead}
                                className="text-xs text-blue-600 hover:text-blue-700 font-medium px-2 py-1 hover:bg-blue-50 rounded"
                            >
                                Mark all read
                            </button>
                            <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full">
                                <X className="w-3.5 h-3.5 text-gray-500" />
                            </button>
                        </div>
                    </div>

                    <div className="max-h-[400px] overflow-y-auto">
                        {isLoading ? (
                            <div className="p-8 text-center text-gray-400 text-xs">Loading...</div>
                        ) : notifications.length === 0 ? (
                            <div className="p-8 text-center text-gray-400 text-xs">No notifications yet</div>
                        ) : (
                            <div>
                                {notifications.map(n => (
                                    <div
                                        key={n.id}
                                        className={cn(
                                            "p-3 border-b border-gray-50 hover:bg-gray-50 transition-colors flex gap-3",
                                            !n.is_read && "bg-blue-50/30"
                                        )}
                                    >
                                        <div className="mt-1 flex-shrink-0">
                                            {getIcon(n.type)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-gray-900 truncate">{n.title}</p>
                                            <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{n.message}</p>
                                            <p className="text-[10px] text-gray-400 mt-1.5">
                                                {format(new Date(n.created_at), 'MMM d, h:mm a')}
                                            </p>
                                        </div>
                                        {!n.is_read && (
                                            <div className="mt-2 w-1.5 h-1.5 bg-blue-500 rounded-full flex-shrink-0" />
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
