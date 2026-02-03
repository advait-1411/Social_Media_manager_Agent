import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, X, Calendar } from 'lucide-react';

interface ScheduleModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (date: string) => Promise<void>;
}

export function ScheduleModal({ isOpen, onClose, onConfirm }: ScheduleModalProps) {
    const [date, setDate] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (!date) return;
        setIsSubmitting(true);
        try {
            await onConfirm(date);
            setDate(''); // Reset on success
        } catch (e) {
            console.error(e);
        } finally {
            setIsSubmitting(false);
        }
    };

    // Construct local ISO string for min date (system local time)
    const now = new Date();
    // Offset for local timezone to match input "datetime-local" behavior
    // This gives "YYYY-MM-DDTHH:MM" in local time
    const localNow = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-6"
                >
                    <motion.div
                        initial={{ scale: 0.95, y: 20 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.95, y: 20 }}
                        className="bg-white rounded-2xl w-full max-w-sm flex flex-col shadow-2xl overflow-hidden"
                    >
                        <div className="p-4 border-b flex items-center justify-between">
                            <h3 className="font-semibold text-lg flex items-center gap-2">
                                <Calendar className="w-5 h-5 text-blue-600" />
                                Schedule Post
                            </h3>
                            <button onClick={onClose} disabled={isSubmitting}>
                                <X className="w-5 h-5 text-gray-500 hover:text-gray-900" />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <p className="text-sm text-gray-600">Choose a date and time for your post to be published automatically.</p>

                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-gray-700 uppercase">Date & Time</label>
                                <input
                                    type="datetime-local"
                                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={date}
                                    min={localNow}
                                    onChange={(e) => setDate(e.target.value)}
                                    disabled={isSubmitting}
                                />
                            </div>

                            <div className="pt-2 flex justify-end gap-2">
                                <button
                                    onClick={onClose}
                                    disabled={isSubmitting}
                                    className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSubmit}
                                    disabled={!date || isSubmitting}
                                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                                    Schedule
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
