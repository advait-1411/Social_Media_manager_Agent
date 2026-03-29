"use client";

import React, { createContext, useContext, useState, ReactNode } from 'react';
import { toast } from 'sonner';
import { postsApi, VariationItem } from '@/lib/api';

type BulkJobStatus = 'idle' | 'generating' | 'done' | 'error';

type BulkJobState = {
  status: BulkJobStatus;
  variations: VariationItem[];
  error: string | null;
  prompt: string | null;
};

type BulkJobContextValue = {
  jobState: BulkJobState;
  triggerBulkGenerate: (params: {
    prompt: string;
    brand_kit_id?: number | null;
    count?: number;
  }) => void;
  clearJob: () => void;
};

const BulkJobContext = createContext<BulkJobContextValue | undefined>(undefined);

export function BulkJobProvider({ children }: { children: ReactNode }) {
  const [jobState, setJobState] = useState<BulkJobState>({
    status: 'idle',
    variations: [],
    error: null,
    prompt: null,
  });

  const triggerBulkGenerate = (params: {
    prompt: string;
    brand_kit_id?: number | null;
    count?: number;
  }) => {
    // Start generating
    setJobState({
      status: 'generating',
      prompt: params.prompt,
      variations: [],
      error: null,
    });

    // Fire and forget
    postsApi.generateBulkVariations(params)
      .then((variations) => {
        setJobState((prev) => ({
          ...prev,
          status: 'done',
          variations,
        }));
        toast.success("✨ Variations ready! Head to Create to review them.");
      })
      .catch((err) => {
        const errorMessage = err instanceof Error ? err.message : 'Unknown generation error';
        setJobState((prev) => ({
          ...prev,
          status: 'error',
          error: errorMessage,
        }));
        toast.error(`Generation failed: ${errorMessage}`);
      });
  };

  const clearJob = () => {
    setJobState({
      status: 'idle',
      variations: [],
      error: null,
      prompt: null,
    });
  };

  return (
    <BulkJobContext.Provider value={{ jobState, triggerBulkGenerate, clearJob }}>
      {children}
    </BulkJobContext.Provider>
  );
}

export function useBulkJob() {
  const context = useContext(BulkJobContext);
  if (context === undefined) {
    throw new Error('useBulkJob must be used within a BulkJobProvider');
  }
  return context;
}
