"use client"

import { useState, useEffect } from 'react';
import { Sparkles, Upload, Search, Filter, RefreshCw, Image as ImageIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import Image from 'next/image';

interface Asset {
    id: number;
    file_path: string;
    created_at: string;
    prompt: string;
    asset_type: string;
}

export default function AssetsPage() {
    const [assets, setAssets] = useState<Asset[]>([]);
    const [loading, setLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);
    const [prompt, setPrompt] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [backendConnected, setBackendConnected] = useState<boolean | null>(null);

    const fetchAssets = async () => {
        try {
            const res = await fetch('http://localhost:8000/api/assets/');
            if (res.ok) {
                const data = await res.json();
                setAssets(data);
            } else {
                console.error("Failed to fetch assets:", res.statusText);
                setError(`Failed to load assets: ${res.status} ${res.statusText}`);
            }
        } catch (error: any) {
            console.error("Failed to fetch assets", error);
            if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
                setError("Cannot connect to backend server. Make sure the backend is running on http://localhost:8000");
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // Check backend connection first
        const checkBackend = async () => {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout
                
                const res = await fetch('http://localhost:8000/', { 
                    method: 'GET',
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                setBackendConnected(res.ok);
            } catch (e: any) {
                setBackendConnected(false);
                if (e.name !== 'AbortError') {
                    console.error("Backend not reachable:", e);
                }
            }
        };
        
        checkBackend();
        fetchAssets();
    }, []);

    const handleGenerate = async () => {
        if (!prompt.trim()) return;
        
        setIsGenerating(true);
        setError(null);
        setSuccess(null);
        
        try {
            const res = await fetch('http://localhost:8000/api/assets/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: prompt.trim(), count: 4, model: 'google/gemini-2.5-flash-image' })
            });
            
            if (res.ok) {
                const data = await res.json();
                setPrompt("");
                setSuccess(`Successfully generated ${data.length} image(s)!`);
                await fetchAssets();
                // Clear success message after 3 seconds
                setTimeout(() => setSuccess(null), 3000);
            } else {
                // Handle error response
                let errorMessage = 'Failed to generate images';
                try {
                    const errorData = await res.json();
                    errorMessage = typeof errorData.detail === 'string' 
                        ? errorData.detail 
                        : errorData.detail?.message || errorData.message || `Server error (${res.status})`;
                } catch {
                    errorMessage = `Server error: ${res.status} ${res.statusText}`;
                }
                setError(errorMessage);
            }
        } catch (e: any) {
            console.error("Generation error:", e);
            // More specific error messages
            if (e.message?.includes('Failed to fetch') || e.message?.includes('NetworkError')) {
                setError("Cannot connect to backend server. Please ensure:\n1. Backend is running on http://localhost:8000\n2. No firewall is blocking the connection\n3. Check browser console for CORS errors");
            } else if (e.message?.includes('timeout')) {
                setError("Request timed out. The image generation is taking too long. Please try again.");
            } else {
                setError(e.message || "Network error: Could not connect to the server. Make sure the backend is running on port 8000.");
            }
        } finally {
            setIsGenerating(false);
        }
    };

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        
        setError(null);
        setSuccess(null);
        
        // Upload each file
        const uploadPromises = Array.from(files).map(async (file) => {
            const formData = new FormData();
            formData.append('file', file);
            
            try {
                const res = await fetch('http://localhost:8000/api/assets/upload', {
                    method: 'POST',
                    body: formData
                });
                
                if (!res.ok) {
                    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
                    throw new Error(errorData.detail || `Upload failed: ${res.statusText}`);
                }
                
                return await res.json();
            } catch (error: any) {
                throw new Error(`Failed to upload ${file.name}: ${error.message}`);
            }
        });
        
        try {
            const results = await Promise.all(uploadPromises);
            setSuccess(`Successfully uploaded ${results.length} file(s)!`);
            await fetchAssets();
            // Clear success message after 3 seconds
            setTimeout(() => setSuccess(null), 3000);
        } catch (error: any) {
            setError(error.message || "Failed to upload files");
        } finally {
            // Reset file input
            e.target.value = '';
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Asset Closet</h1>
                    <p className="text-gray-500 text-sm">Manage your generated images and uploads.</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => document.getElementById('gen-panel')?.scrollIntoView({ behavior: 'smooth' })}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 flex items-center gap-2 shadow-sm"
                    >
                        <Sparkles className="w-4 h-4" />
                        Generate New
                    </button>
                    <label className="bg-white border text-gray-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-50 flex items-center gap-2 shadow-sm cursor-pointer">
                        <Upload className="w-4 h-4" />
                        <input
                            type="file"
                            accept="image/*,video/*"
                            className="hidden"
                            onChange={handleUpload}
                            multiple
                        />
                        Upload
                    </label>
                </div>
            </div>

            {/* Generator Panel */}
            <div id="gen-panel" className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden">
                <div className="max-w-3xl">
                    {/* Backend Connection Status */}
                    {backendConnected === false && (
                        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                            <p className="text-sm text-yellow-800">
                                <strong>⚠️ Backend not connected:</strong> Make sure the backend server is running on <code className="bg-yellow-100 px-1 rounded">http://localhost:8000</code>
                            </p>
                        </div>
                    )}
                    
                    <label className="block text-sm font-medium text-gray-700 mb-2">Generate Images with AI</label>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                            placeholder="Describe the image you want..."
                            value={prompt}
                            onChange={(e) => {
                                setPrompt(e.target.value);
                                setError(null);
                            }}
                            onKeyDown={(e) => e.key === 'Enter' && !isGenerating && prompt.trim() && handleGenerate()}
                            disabled={isGenerating}
                        />
                        <button
                            onClick={handleGenerate}
                            disabled={isGenerating || !prompt.trim()}
                            className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {isGenerating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                            {isGenerating ? 'Generating...' : 'Generate'}
                        </button>
                    </div>
                    
                    {/* Error Message */}
                    {error && (
                        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                            <p className="text-sm text-red-700 whitespace-pre-line">{error}</p>
                        </div>
                    )}
                    
                    {/* Success Message */}
                    {success && (
                        <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                            <p className="text-sm text-green-700">{success}</p>
                        </div>
                    )}
                    
                    <p className="text-xs text-gray-400 mt-2">Powered by Gemini 2.5 Flash / OpenRouter</p>
                </div>
                {/* Background decoration */}
                <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                    <Sparkles className="w-32 h-32 text-indigo-600" />
                </div>
            </div>

            {/* Filters & Search */}
            <div className="flex flex-col sm:flex-row gap-4 items-center bg-white p-2 rounded-lg border border-gray-200 shadow-sm">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                        type="text"
                        placeholder="Search assets..."
                        className="w-full pl-9 pr-4 py-2 text-sm outline-none bg-transparent"
                    />
                </div>
                <div className="flex gap-2 w-full sm:w-auto px-2">
                    <button className="p-2 hover:bg-gray-50 rounded-md text-gray-500"><Filter className="w-4 h-4" /></button>
                    <select className="text-sm bg-transparent outline-none text-gray-600 cursor-pointer">
                        <option>All Assets</option>
                        <option>Generated</option>
                        <option>Uploaded</option>
                    </select>
                </div>
            </div>

            {/* Asset Grid */}
            {loading ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 animate-pulse">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                        <div key={i} className="aspect-square bg-gray-200 rounded-xl"></div>
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
                    {assets.map((asset) => {
                        // Correct path for serving: backend serves generated_images at /generated_images static mount
                        // But we are on localhost:3000 accessing localhost:8000
                        // Ideally we need full URL or proxy
                        // Asset.file_path is likely "generated_images/filename.jpg".
                        // We need to append backend base url.

                        // Strip any leading ./ or /
                        const cleanPath = asset.file_path.replace(/^\.?\//, '');
                        const imageUrl = `http://localhost:8000/${cleanPath}`;

                        return (
                            <motion.div
                                key={asset.id}
                                layout
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="group relative aspect-square bg-gray-100 rounded-xl overflow-hidden border border-gray-200 shadow-sm hover:shadow-md transition-all cursor-pointer"
                            >
                                <Image
                                    src={imageUrl}
                                    alt={asset.prompt || "Asset"}
                                    fill
                                    className="object-cover transition-transform duration-500 group-hover:scale-110"
                                    unoptimized
                                />

                                {/* Overlay */}
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                                    <p className="text-white text-xs line-clamp-2 font-medium">{asset.prompt || "No prompt"}</p>
                                    <div className="flex gap-2 mt-2">
                                        <button className="bg-white/20 hover:bg-white/40 backdrop-blur-md p-1.5 rounded-md text-white transition-colors">
                                            <Upload className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        )
                    })}
                </div>
            )}

            {!loading && assets.length === 0 && (
                <div className="text-center py-20">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
                        <ImageIcon className="w-8 h-8 text-gray-400" />
                    </div>
                    <h3 className="text-gray-900 font-medium">No assets yet</h3>
                    <p className="text-gray-500 text-sm mt-1">Generate some images or upload your own.</p>
                </div>
            )}
        </div>
    );
}
