"use client"

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    Home,
    Calendar,
    PenTool,
    Library,
    CheckSquare,
    BarChart2,
    Settings,
    Plus,
    Bell,
    HelpCircle,
    Menu,
    ChevronDown
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

const NAV_ITEMS = [
    { name: 'Home', icon: Home, href: '/' },
    { name: 'Publish', icon: Calendar, href: '/publish' },
    { name: 'Create', icon: PenTool, href: '/create' },
    { name: 'Assets', icon: Library, href: '/assets' },
    { name: 'Approvals', icon: CheckSquare, href: '/approvals' },
    { name: 'Analytics', icon: BarChart2, href: '/analytics' },
    { name: 'Settings', icon: Settings, href: '/settings' },
];

export default function LayoutShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    return (
        <div className="flex h-screen w-full bg-[#FAFAFB] text-[#171717] overflow-hidden">

            {/* Sidebar - Desktop */}
            <motion.aside
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="hidden md:flex w-64 flex-col bg-white border-r border-[#E6E8EE] h-full shadow-sm z-20"
            >
                <div className="h-16 flex items-center px-6 border-b border-[#E6E8EE]">
                    <div className="flex items-center gap-2">
                        <motion.div
                            whileHover={{ rotate: 10, scale: 1.1 }}
                            className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold shadow-blue-200 shadow-lg cursor-pointer"
                        >
                            V
                        </motion.div>
                        <span className="font-semibold text-lg tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600">VelvetQueue</span>
                    </div>
                </div>

                <div className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
                    {NAV_ITEMS.map((item, index) => {
                        const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
                        return (
                            <Link
                                key={item.name}
                                href={item.href}
                            >
                                <motion.div
                                    initial={{ x: -10, opacity: 0 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    transition={{ delay: index * 0.05 + 0.2 }}
                                    className={cn(
                                        "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all relative overflow-hidden group",
                                        isActive
                                            ? "bg-blue-50/80 text-blue-700"
                                            : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                                    )}
                                >
                                    {isActive && (
                                        <motion.div
                                            layoutId="activeNavIndicator"
                                            className="absolute left-0 w-1 h-6 bg-blue-600 rounded-r-full"
                                        />
                                    )}
                                    <item.icon className={cn("w-5 h-5 transition-transform group-hover:scale-110", isActive ? "text-blue-600" : "text-gray-400")} />
                                    {item.name}
                                </motion.div>
                            </Link>
                        )
                    })}
                </div>

                <div className="p-4 border-t border-[#E6E8EE]">
                    <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors group">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-blue-400 ring-2 ring-white shadow-sm group-hover:scale-105 transition-transform"></div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">Workspace</p>
                            <p className="text-xs text-gray-500 truncate">My Brand</p>
                        </div>
                        <ChevronDown className="w-4 h-4 text-gray-400 group-hover:text-gray-600" />
                    </div>
                </div>
            </motion.aside>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">

                {/* Top Header */}
                <header className="h-16 bg-white/70 backdrop-blur-md border-b border-[#E6E8EE] flex items-center justify-between px-6 z-10 sticky top-0 w-full transition-all">
                    <div className="flex items-center gap-4">
                        <button
                            className="md:hidden p-2 text-gray-600 hover:bg-gray-100 rounded-md"
                            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                        >
                            <Menu className="w-5 h-5" />
                        </button>
                        <nav className="hidden md:flex items-center gap-6">
                            {['Create', 'Publish', 'Community', 'Analyze'].map((tab) => (
                                <button
                                    key={tab}
                                    className="text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors relative group py-1"
                                >
                                    {tab}
                                    <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-blue-600 transition-all group-hover:w-full opacity-0 group-hover:opacity-100" />
                                </button>
                            ))}
                        </nav>
                    </div>

                    <div className="flex items-center gap-4">
                        <button className="text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-100 transition hover:rotate-12">
                            <HelpCircle className="w-5 h-5" />
                        </button>
                        <button className="text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-100 transition hover:shake">
                            <Bell className="w-5 h-5" />
                        </button>
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className="bg-[#2C6ECB] hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium text-sm flex items-center gap-2 shadow-lg shadow-blue-200 transition-all"
                        >
                            <Plus className="w-4 h-4" />
                            New Post
                        </motion.button>
                    </div>
                </header>

                {/* Scrollable Content */}
                <main className="flex-1 overflow-y-auto bg-[#FAFAFB] p-6 no-scrollbar">
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="mx-auto max-w-6xl"
                    >
                        {children}
                    </motion.div>
                </main>

            </div>

            {/* Mobile Drawer (Simplistic) */}
            <AnimatePresence>
                {isMobileMenuOpen && (
                    <motion.div
                        initial={{ x: "-100%" }}
                        animate={{ x: 0 }}
                        exit={{ x: "-100%" }}
                        className="fixed inset-y-0 left-0 w-64 bg-white shadow-2xl z-50 md:hidden flex flex-col"
                    >
                        <div className="h-16 flex items-center justify-between px-6 border-b">
                            <span className="font-bold text-lg">VelvetQueue</span>
                            <button onClick={() => setIsMobileMenuOpen(false)}>×</button>
                        </div>
                        <div className="p-4 space-y-2">
                            {NAV_ITEMS.map((item) => (
                                <Link
                                    key={item.name}
                                    href={item.href}
                                    onClick={() => setIsMobileMenuOpen(false)}
                                    className="block px-4 py-3 rounded-lg text-gray-700 hover:bg-gray-50"
                                >
                                    {item.name}
                                </Link>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
