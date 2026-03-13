"use client"

import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { toast } from 'sonner';

interface SocketContextType {
    socket: Socket | null;
    isConnected: boolean;
    hasUnread: boolean;
    setHasUnread: (has: boolean) => void;
}

const SocketContext = createContext<SocketContextType>({
    socket: null,
    isConnected: false,
    hasUnread: false,
    setHasUnread: () => { },
});

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }: { children: React.ReactNode }) => {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [hasUnread, setHasUnread] = useState(false);

    useEffect(() => {
        // Connect to FastAPI backend with /ws path
        // Ensure path matches what we mounted in main.py
        const socketInstance = io('http://localhost:8000', {
            transports: ['websocket'],
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
        });

        socketInstance.on('connect', () => {
            console.log('Socket connected:', socketInstance.id);
            setIsConnected(true);
        });

        socketInstance.on('disconnect', () => {
            console.log('Socket disconnected');
            setIsConnected(false);
        });

        socketInstance.on('connect_error', (err) => {
            console.error('Socket connection error:', err);
        });

        // Listen for global notifications
        socketInstance.on('post_status', (data: { id: number, status: string, title?: string, message?: string }) => {
            console.log("Received post_status event:", data);
            setHasUnread(true);

            if (data.status === 'published') {
                toast.success(data.title || 'Post Published', {
                    description: data.message || 'Your post has been successfully published.',
                    duration: 5000,
                });
            } else if (data.status === 'scheduled') {
                toast.info(data.title || 'Post Scheduled', {
                    description: data.message || 'Your post has been scheduled.',
                    duration: 4000,
                });
            } else if (data.status === 'failed') {
                toast.error(data.title || 'Post Failed', {
                    description: data.message || 'Something went wrong.',
                    duration: 6000,
                });
            }
        });

        socketInstance.on('batch_posts_created', (data: { count: number, primary_post_id: number, draft_count: number, message: string }) => {
            console.log("Received batch_posts_created event:", data);
            toast.success("🎉 Posts saved! Your batch drafts are ready in the queue.", {
                description: data.message,
                duration: 5000,
            });
        });

        setSocket(socketInstance);

        return () => {
            socketInstance.disconnect();
        };
    }, []);

    return (
        <SocketContext.Provider value={{ socket, isConnected, hasUnread, setHasUnread }}>
            {children}
        </SocketContext.Provider>
    );
};
