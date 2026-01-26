"use client"

import { motion } from 'framer-motion';
import { ArrowRight, Sparkles, Image as ImageIcon, Calendar } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import Image from 'next/image';

export default function Home() {
  return (
    <div className="space-y-8 font-sans text-[#14225e]">

      {/* Buffer UI Inspired Hero Section */}
      <section className="flex flex-col lg:flex-row items-stretch bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden min-h-[600px]">
        {/* Left Content */}
        <div className="flex-1 p-8 md:p-16 flex flex-col justify-center">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-[#231ef7] font-bold uppercase text-base mb-2 tracking-wider"
          >
            Welcome
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-[38px] md:text-[48px] font-bold leading-[1.2] mb-12"
          >
            Start your journey<br />
            here at VelvetQueue
          </motion.h1>

          <div className="space-y-8">
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Link href="/assets" className="group block border-l-[5px] border-[#14225e] pl-5 py-2 hover:border-l-[10px] hover:pl-8 transition-all duration-200 cursor-pointer">
                <span className="block text-2xl font-bold mb-1 group-hover:text-[#231ef7] transition-colors">Assets</span>
                <span className="block text-base text-gray-600 font-normal">
                  Not sure where to start? Check out our AI asset closet to generate stunning visuals.
                </span>
              </Link>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Link href="/create" className="group block border-l-[5px] border-[#14225e] pl-5 py-2 hover:border-l-[10px] hover:pl-8 transition-all duration-200 cursor-pointer">
                <span className="block text-2xl font-bold mb-1 group-hover:text-[#231ef7] transition-colors">Create</span>
                <span className="block text-base text-gray-600 font-normal">
                  Craft the perfect post for Instagram, LinkedIn, and Twitter with our composer.
                </span>
              </Link>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 }}
            >
              <Link href="/publish" className="group block border-l-[5px] border-[#14225e] pl-5 py-2 hover:border-l-[10px] hover:pl-8 transition-all duration-200 cursor-pointer">
                <span className="block text-2xl font-bold mb-1 group-hover:text-[#231ef7] transition-colors">Schedule</span>
                <span className="block text-base text-gray-600 font-normal">
                  Plan your content calendar and automate your growth across platforms.
                </span>
              </Link>
            </motion.div>
          </div>
        </div>

        {/* Right Illustration */}
        <div className="flex-1 bg-gray-50 relative min-h-[300px] lg:min-h-auto">
          <div className="absolute inset-0 flex items-center justify-center p-12">
            {/* Abstract geometric illustration style */}
            <div className="relative w-full h-full max-w-md aspect-square">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-gradient-to-tr from-blue-100 to-purple-100 rounded-full blur-3xl opacity-60"></div>
              <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" className="w-full h-full relative z-10 drop-shadow-2xl">
                <circle cx="100" cy="100" r="80" fill="#231ef7" opacity="0.1" />
                <path fill="#231ef7" d="M44.9,-76.4C58.9,-69.2,71.8,-59.1,81.6,-46.9C91.4,-34.7,98.1,-20.4,95.8,-6.6C93.5,7.2,82.2,20.4,71.5,31.7C60.8,43,50.7,52.4,39.4,60.8C28.1,69.2,15.6,76.6,1.4,74.2C-12.8,71.8,-28.7,59.6,-41.8,49.2C-54.9,38.8,-65.2,30.2,-72.1,19.3C-79,8.4,-82.5,-4.8,-79.3,-17.1C-76.1,-29.4,-66.2,-40.8,-54.6,-49.1C-43,-57.4,-29.7,-62.6,-16.6,-65.4C-3.5,-68.2,9.4,-68.6,22.9,-76.4Z" transform="translate(100 100) scale(0.8)" />
                <circle cx="100" cy="100" r="40" fill="#ffffff" />
                <rect x="85" y="85" width="30" height="30" rx="8" fill="#14225e" />
              </svg>
            </div>
          </div>
        </div>
      </section>

      {/* Recent Activity Stub (Kept for functionality) */}
      <section className="bg-white rounded-xl border border-gray-200 shadow-sm mt-8">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Recent Activity</h2>
          <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">View all</button>
        </div>
        <div className="p-6 text-center py-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-50 mb-4">
            <Calendar className="w-8 h-8 text-gray-300" />
          </div>
          <p className="text-gray-500 font-medium">No recent posts scheduled.</p>
          <p className="text-gray-400 text-sm mt-1">Start by creating a new post or generating assets.</p>
        </div>
      </section>

    </div>
  );
}
