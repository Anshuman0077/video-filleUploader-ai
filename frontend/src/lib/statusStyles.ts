import { Video, VideoStatus } from '@/types';

export const getStatusBadgeClasses = (status: VideoStatus): string => {
  const baseClasses = 'inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold transition-all duration-300';
  
  switch (status) {
    case 'completed':
      return `${baseClasses} bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg hover:shadow-xl transform hover:scale-105`;
    case 'processing':
      return `${baseClasses} bg-gradient-to-r from-yellow-500 to-amber-600 text-white shadow-lg animate-pulse hover:shadow-xl`;
    case 'queued':
      return `${baseClasses} bg-gradient-to-r from-blue-500 to-cyan-600 text-white shadow-lg hover:shadow-xl transform hover:scale-105`;
    case 'failed':
      return `${baseClasses} bg-gradient-to-r from-red-500 to-pink-600 text-white shadow-lg hover:shadow-xl`;
    default:
      return `${baseClasses} bg-gradient-to-r from-gray-500 to-gray-600 text-white shadow-lg`;
  }
};

export const getStatusIcon = (status: VideoStatus): string => {
  switch (status) {
    case 'completed':
      return '✅'; // Check mark
    case 'processing':
      return '⚡'; // Lightning bolt
    case 'queued':
      return '⏳'; // Hourglass
    case 'failed':
      return '❌'; // Cross mark
    default:
      return '❓'; // Question mark
  }
};

export const getStatusDescription = (status: VideoStatus): string => {
  switch (status) {
    case 'completed':
      return 'Video processing completed - Ready for questions and analysis';
    case 'processing':
      return 'AI is analyzing video content - This may take a few minutes';
    case 'queued':
      return 'Video is in queue - Processing will start soon';
    case 'failed':
      return 'Processing failed - Please try uploading again';
    default:
      return 'Unknown status - Please refresh the page';
  }
};

export const getStatusColor = (status: VideoStatus): string => {
  switch (status) {
    case 'completed':
      return 'text-green-400';
    case 'processing':
      return 'text-yellow-400';
    case 'queued':
      return 'text-blue-400';
    case 'failed':
      return 'text-red-400';
    default:
      return 'text-gray-400';
  }
};

export const getStatusBgColor = (status: VideoStatus): string => {
  switch (status) {
    case 'completed':
      return 'bg-green-500/20';
    case 'processing':
      return 'bg-yellow-500/20';
    case 'queued':
      return 'bg-blue-500/20';
    case 'failed':
      return 'bg-red-500/20';
    default:
      return 'bg-gray-500/20';
  }
};

export const getStatusBorderColor = (status: VideoStatus): string => {
  switch (status) {
    case 'completed':
      return 'border-green-400/50';
    case 'processing':
      return 'border-yellow-400/50';
    case 'queued':
      return 'border-blue-400/50';
    case 'failed':
      return 'border-red-400/50';
    default:
      return 'border-gray-400/50';
  }
};

// Enhanced utility for progress bars
export const getProgressBarColor = (progress: number): string => {
  if (progress >= 90) return 'bg-green-500';
  if (progress >= 70) return 'bg-blue-500';
  if (progress >= 50) return 'bg-yellow-500';
  if (progress >= 30) return 'bg-orange-500';
  return 'bg-red-500';
};

export const getProgressBarWidth = (progress: number): string => {
  return `${Math.max(0, Math.min(100, progress))}%`;
};

// Phase-specific status information
export const getPhaseInfo = (phase: string) => {
  const phases: Record<string, { name: string; description: string; icon: string }> = {
    download: { 
      name: 'Downloading', 
      description: 'Downloading video from cloud storage',
      icon: '📥'
    },
    transcription: { 
      name: 'Transcribing', 
      description: 'Converting audio to text using AI',
      icon: '🎵'
    },
    chunking: { 
      name: 'Chunking', 
      description: 'Splitting audio into manageable segments',
      icon: '✂️'
    },
    summary: { 
      name: 'Summarizing', 
      description: 'Generating video summary',
      icon: '📝'
    },
    embeddings: { 
      name: 'Generating Embeddings', 
      description: 'Creating AI embeddings for search',
      icon: '🧠'
    },
    finalizing: { 
      name: 'Finalizing', 
      description: 'Completing processing pipeline',
      icon: '✨'
    },
    completed: { 
      name: 'Completed', 
      description: 'Video processing finished',
      icon: '✅'
    }
  };

  return phases[phase] || { 
    name: phase, 
    description: 'Processing in progress', 
    icon: '⚙️' 
  };
};

// Export for use in components
export default {
  getStatusBadgeClasses,
  getStatusIcon,
  getStatusDescription,
  getStatusColor,
  getStatusBgColor,
  getStatusBorderColor,
  getProgressBarColor,
  getProgressBarWidth,
  getPhaseInfo
};