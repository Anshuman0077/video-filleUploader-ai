import { Video } from '@/types';

export const getStatusBadgeClasses = (status: Video['status']): string => {
  switch (status) {
    case 'completed':
      return 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg';
    case 'processing':
      return 'bg-gradient-to-r from-yellow-500 to-amber-600 text-white shadow-lg animate-pulse';
    case 'queued':
      return 'bg-gradient-to-r from-blue-500 to-cyan-600 text-white shadow-lg';
    case 'failed':
    default:
      return 'bg-gradient-to-r from-red-500 to-pink-600 text-white shadow-lg';
  }
};

export const getStatusIcon = (status: Video['status']): string => {
  switch (status) {
    case 'completed':
      return '✅';
    case 'processing':
      return '⚡';
    case 'queued':
      return '⏳';
    case 'failed':
      return '❌';
    default:
      return '❓';
  }
};

export const getStatusDescription = (status: Video['status']): string => {
  switch (status) {
    case 'completed':
      return 'Ready for questions';
    case 'processing':
      return 'Analyzing video content';
    case 'queued':
      return 'Waiting in queue';
    case 'failed':
      return 'Processing failed';
    default:
      return 'Unknown status';
  }
};