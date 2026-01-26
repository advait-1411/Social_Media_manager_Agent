"use client"

import { useState } from 'react';
import {
    CheckCircle, XCircle, Clock, Eye,
    MessageSquare, Calendar, ChevronRight, Instagram
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

// Mock approvals data
const MOCK_APPROVALS = [
    {
        id: 1,
        title: 'New Product Launch',
        requester: 'Kunal M.',
        status: 'pending',
        platform: 'instagram',
        scheduledFor: '2026-01-24 10:00 AM',
        caption: 'Exciting news! Our new product line is launching tomorrow. Stay tuned for the big reveal! 🚀 #NewLaunch #ProductDrop'
    },
    {
        id: 2,
        title: 'Customer Testimonial',
        requester: 'Advait P.',
        status: 'approved',
        platform: 'instagram',
        scheduledFor: '2026-01-25 02:00 PM',
        caption: 'Thank you to our amazing customers for the wonderful feedback! Your support means everything to us. ❤️'
    },
    {
        id: 3,
        title: 'Behind the Scenes',
        requester: 'Kunal M.',
        status: 'rejected',
        platform: 'instagram',
        scheduledFor: null,
        caption: 'Take a peek behind the scenes at our office...',
        rejectionReason: 'Image quality too low. Please use higher resolution.'
    },
];

export default function ApprovalsPage() {
    const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
    const [selectedApproval, setSelectedApproval] = useState<number | null>(null);

    const filteredApprovals = filter === 'all'
        ? MOCK_APPROVALS
        : MOCK_APPROVALS.filter(a => a.status === filter);

    const statusConfig: Record<string, { icon: any; color: string; bg: string }> = {
        pending: { icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
        approved: { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
        rejected: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50' },
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Approvals</h1>
                    <p className="text-gray-500 text-sm">Review and approve scheduled posts.</p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">
                        {MOCK_APPROVALS.filter(a => a.status === 'pending').length} pending
                    </span>
                </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-2">
                {(['all', 'pending', 'approved', 'rejected'] as const).map(status => (
                    <button
                        key={status}
                        onClick={() => setFilter(status)}
                        className={cn(
                            "px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all",
                            filter === status
                                ? "bg-white border border-gray-200 shadow-sm text-gray-900"
                                : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                        )}
                    >
                        {status}
                        {status === 'pending' && (
                            <span className="ml-2 bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full text-xs">
                                {MOCK_APPROVALS.filter(a => a.status === 'pending').length}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Approvals List */}
            <div className="space-y-4">
                {filteredApprovals.map((approval, i) => {
                    const config = statusConfig[approval.status];
                    const StatusIcon = config.icon;

                    return (
                        <motion.div
                            key={approval.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className={cn(
                                "bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden transition-all cursor-pointer hover:shadow-md",
                                selectedApproval === approval.id && "ring-2 ring-blue-500"
                            )}
                            onClick={() => setSelectedApproval(selectedApproval === approval.id ? null : approval.id)}
                        >
                            <div className="p-5 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    {/* Thumbnail */}
                                    <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center">
                                        <Instagram className="w-6 h-6 text-gray-300" />
                                    </div>

                                    <div>
                                        <h3 className="font-semibold text-gray-900">{approval.title}</h3>
                                        <p className="text-sm text-gray-500 mt-0.5">
                                            Requested by {approval.requester}
                                        </p>
                                        {approval.scheduledFor && (
                                            <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                                                <Calendar className="w-3 h-3" /> {approval.scheduledFor}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-4">
                                    <span className={cn(
                                        "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium capitalize",
                                        config.bg, config.color
                                    )}>
                                        <StatusIcon className="w-3.5 h-3.5" />
                                        {approval.status}
                                    </span>
                                    <ChevronRight className={cn(
                                        "w-5 h-5 text-gray-400 transition-transform",
                                        selectedApproval === approval.id && "rotate-90"
                                    )} />
                                </div>
                            </div>

                            {/* Expanded Details */}
                            {selectedApproval === approval.id && (
                                <motion.div
                                    initial={{ height: 0 }}
                                    animate={{ height: 'auto' }}
                                    className="border-t border-gray-100 bg-gray-50 px-5 py-4"
                                >
                                    <div className="flex gap-6">
                                        {/* Caption Preview */}
                                        <div className="flex-1">
                                            <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Caption</h4>
                                            <p className="text-sm text-gray-700 bg-white p-3 rounded-lg border border-gray-200">
                                                {approval.caption}
                                            </p>

                                            {approval.status === 'rejected' && approval.rejectionReason && (
                                                <div className="mt-3 p-3 bg-red-50 border border-red-100 rounded-lg">
                                                    <p className="text-xs font-semibold text-red-600 mb-1">Rejection Reason</p>
                                                    <p className="text-sm text-red-700">{approval.rejectionReason}</p>
                                                </div>
                                            )}
                                        </div>

                                        {/* Actions */}
                                        {approval.status === 'pending' && (
                                            <div className="flex flex-col gap-2 w-40">
                                                <button className="w-full bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 flex items-center justify-center gap-2 transition-colors">
                                                    <CheckCircle className="w-4 h-4" /> Approve
                                                </button>
                                                <button className="w-full bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-50 flex items-center justify-center gap-2 transition-colors">
                                                    <MessageSquare className="w-4 h-4" /> Request Changes
                                                </button>
                                                <button className="w-full border border-red-200 text-red-600 px-4 py-2 rounded-lg font-medium hover:bg-red-50 flex items-center justify-center gap-2 transition-colors">
                                                    <XCircle className="w-4 h-4" /> Reject
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            )}
                        </motion.div>
                    );
                })}

                {filteredApprovals.length === 0 && (
                    <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
                            <CheckCircle className="w-8 h-8 text-gray-300" />
                        </div>
                        <h3 className="text-gray-900 font-medium">No approvals found</h3>
                        <p className="text-gray-500 text-sm mt-1">
                            {filter === 'pending' ? "All caught up! No pending approvals." : `No ${filter} items.`}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
