'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useUser, useAuth } from '@clerk/nextjs'; // Added useAuth
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Video, VideoFilters } from '@/types';
import { apiClient, ApiClientError } from '@/lib/api';
import { getStatusBadgeClasses, getStatusIcon } from '@/lib/statusStyles';
import { 
  Upload, Search, RefreshCw, AlertCircle, Video as VideoIcon, 
  Filter, Download, Play, Brain, Sparkles, Zap,
  FileText, BarChart3, Clock, CheckCircle
} from 'lucide-react';
import toast from 'react-hot-toast';


interface DashboardState {
  videos: Video[];
  isLoading: boolean;
  isUploading: boolean;
  error: string | null;
  uploadError: string | null;
  filters: VideoFilters;
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  } | null;
  showUploadModal: boolean;
}

interface UploadFormData {
  title: string;
  description: string;
  file: File | null;
  language: string;
}

export default function Dashboard() {
  const { user, isSignedIn, isLoaded } = useUser();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);
  
  const [uploadForm, setUploadForm] = useState<UploadFormData>({
    title: '',
    description: '',
    file: null,
    language: 'english'
  });

  const [state, setState] = useState<DashboardState>({
    videos: [],
    isLoading: true,
    isUploading: false,
    error: null,
    uploadError: null,
    filters: { page: 1, limit: 12 },
    pagination: null,
    showUploadModal: false
  });

  

  // Redirect if not authenticated
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.push('/sign-in');
    }
  }, [isSignedIn, isLoaded, router]);



  // Fetch videos with error handling
  const fetchVideos = useCallback(async (showLoading = true) => {
    if (!isSignedIn) return;
    
    try {
      if (showLoading) {
        setState(prev => ({ ...prev, isLoading: true, error: null }));
      }
      
      const response = await apiClient.getMyVideos(state.filters);
      
      setState(prev => ({
        ...prev,
        videos: response.videos || response.data || [],
        pagination: response.pagination || null,
        isLoading: false,
        error: null
      }));
    } catch (error) {
      console.error('Error fetching videos:', error);
      
      let errorMessage = 'Failed to load videos';
      if (error instanceof ApiClientError) {
        errorMessage = error.message;
        if (error.status === 401) {
          router.push('/sign-in');
          return;
        }
      }
      
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage
      }));
      
      toast.error(errorMessage);
    }
  }, [isSignedIn, state.filters, router]);

  // Initial load
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      fetchVideos();
    }
  }, [fetchVideos, isLoaded, isSignedIn]);

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;

    const file = files[0];
    setUploadForm(prev => ({ 
      ...prev, 
      file,
      title: file.name.replace(/\.[^/.]+$/, '') // Set title from filename
    }));
  };

  // Handle upload with comprehensive validation
  const handleUpload = async () => {
    if (!uploadForm.file) {
      toast.error('Please select a video file');
      return;
    }

    if (!uploadForm.title.trim()) {
      toast.error('Please enter a title for the video');
      return;
    }

    // Client-side validation
    const maxSize = 500 * 1024 * 1024;
    const allowedTypes = [
      'video/mp4', 'video/mpeg', 'video/quicktime', 
      'video/x-msvideo', 'video/webm', 'video/x-matroska'
    ];
    
    if (uploadForm.file.size > maxSize) {
      toast.error('File size must be less than 500MB');
      return;
    }
    
    if (!allowedTypes.includes(uploadForm.file.type)) {
      toast.error('Please select a valid video file (MP4, MPEG, MOV, AVI, WebM, MKV)');
      return;
    }

    setState(prev => ({ 
      ...prev, 
      isUploading: true, 
      uploadError: null 
    }));

    try {
      const result = await apiClient.uploadVideo(uploadForm);
      
      // Reset form and close modal
      setUploadForm({
        title: '',
        description: '',
        file: null,
        language: 'english'
      });
      setState(prev => ({ ...prev, showUploadModal: false }));
      
      toast.success('Video uploaded successfully! Processing started...');
      
      // Navigate to video page
      router.push(`/video/${result.videoId}`);
    } catch (error) {
      console.error('Upload error:', error);
      
      let errorMessage = 'Upload failed. Please try again.';
      if (error instanceof ApiClientError) {
        if (error.status === 413) {
          errorMessage = 'File too large. Please select a smaller video.';
        } else if (error.status === 429) {
          errorMessage = 'Too many uploads. Please wait before uploading again.';
        } else {
          errorMessage = error.message;
        }
      }
      
      setState(prev => ({ 
        ...prev, 
        uploadError: errorMessage 
      }));
      toast.error(errorMessage);
    } finally {
      setState(prev => ({ ...prev, isUploading: false }));
    }
  };

  // Handle search with debouncing
  const handleSearch = (searchTerm: string) => {
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    
    const timeout = setTimeout(() => {
      setState(prev => ({
        ...prev,
        filters: { ...prev.filters, search: searchTerm, page: 1 }
      }));
    }, 500);
    
    setSearchTimeout(timeout);
  };

  // Handle filter changes
  const handleFilterChange = (newFilters: Partial<VideoFilters>) => {
    setState(prev => ({
      ...prev,
      filters: { ...prev.filters, ...newFilters, page: 1 }
    }));
  };

  // Handle pagination
  const handlePageChange = (page: number) => {
    setState(prev => ({
      ...prev,
      filters: { ...prev.filters, page }
    }));
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Loading state
  if (!isLoaded || (isLoaded && !isSignedIn)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-cyan-400 mx-auto mb-4"></div>
          <p className="text-cyan-100 text-lg font-light">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Header */}
      <header className="bg-black/30 backdrop-blur-lg border-b border-white/10 shadow-2xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <div className="bg-gradient-to-r from-cyan-400 to-blue-500 p-2 rounded-xl">
              <Brain className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
              VideoExplainer AI
            </h1>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="text-right">
              <p className="text-cyan-100 text-sm">Welcome back,</p>
              <p className="text-white font-semibold">{user?.firstName || 'User'}</p>
            </div>
            <div className="w-10 h-10 bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full flex items-center justify-center">
              <span className="text-white font-bold text-sm">
                {user?.firstName?.[0] || 'U'}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/10 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-cyan-100 text-sm">Total Videos</p>
                <p className="text-3xl font-bold text-white">{state.pagination?.total || 0}</p>
              </div>
              <VideoIcon className="h-8 w-8 text-cyan-400" />
            </div>
          </div>
          
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/10 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-cyan-100 text-sm">Completed</p>
                <p className="text-3xl font-bold text-white">
                  {state.videos.filter(v => v.status === 'completed').length}
                </p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-400" />
            </div>
          </div>
          
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/10 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-cyan-100 text-sm">Processing</p>
                <p className="text-3xl font-bold text-white">
                  {state.videos.filter(v => v.status === 'processing').length}
                </p>
              </div>
              <Zap className="h-8 w-8 text-yellow-400 animate-pulse" />
            </div>
          </div>
          
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/10 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-cyan-100 text-sm">Storage Used</p>
                <p className="text-3xl font-bold text-white">
                  {formatFileSize(state.videos.reduce((acc, v) => acc + (v.fileSize || 0), 0))}
                </p>
              </div>
              <BarChart3 className="h-8 w-8 text-purple-400" />
            </div>
          </div>
        </div>

        {/* Controls Section */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div>
              <h2 className="text-2xl font-bold text-white">Your Video Library</h2>
              <p className="text-cyan-100 mt-1">Manage and analyze your uploaded videos</p>
            </div>
            
            {/* Upload Button */}
            <button
              onClick={() => setState(prev => ({ ...prev, showUploadModal: true }))}
              className="group relative bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white px-6 py-3 rounded-xl font-semibold shadow-2xl transition-all duration-300 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-slate-900"
            >
              <Sparkles className="w-5 h-5 mr-2 inline-block group-hover:animate-pulse" />
              Upload New Video
            </button>
          </div>
          
          {/* Search and Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-cyan-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search videos by title or description..."
                className="w-full pl-12 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-cyan-100 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent backdrop-blur-lg"
                onChange={(e) => handleSearch(e.target.value)}
              />
            </div>
            
            <select
              value={state.filters.status || ''}
              onChange={(e) => handleFilterChange({ status: e.target.value as any || undefined })}
              className="px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent backdrop-blur-lg"
            >
              <option value="">All Status</option>
              <option value="queued">Queued</option>
              <option value="processing">Processing</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </select>
            
            <button
              onClick={() => fetchVideos()}
              className="px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-cyan-400 hover:bg-white/20 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent backdrop-blur-lg"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        {state.isLoading ? (
          <div className="text-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400 mx-auto mb-4"></div>
            <p className="text-cyan-100 text-lg">Loading your video library...</p>
          </div>
        ) : state.videos.length === 0 ? (
          <div className="text-center py-16 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-lg">
            <VideoIcon className="mx-auto h-16 w-16 text-cyan-400 mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">No videos found</h3>
            <p className="text-cyan-100 mb-6">
              {state.filters.search || state.filters.status 
                ? 'Try adjusting your search or filters.' 
                : 'Get started by uploading your first video!'}
            </p>
            {!(state.filters.search || state.filters.status) && (
              <button
                onClick={() => setState(prev => ({ ...prev, showUploadModal: true }))}
                className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white px-6 py-3 rounded-xl font-semibold hover:from-cyan-600 hover:to-blue-700 transition-all transform hover:scale-105"
              >
                Upload Your First Video
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Video Grid */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {state.videos.map((video) => (
                <Link 
                  key={video._id} 
                  href={`/video/${video._id}`}
                  className="group block focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-slate-900 rounded-2xl transition-all duration-300 transform hover:scale-105"
                >
                  <div className="bg-white/10 backdrop-blur-lg border border-white/10 rounded-2xl overflow-hidden shadow-2xl hover:shadow-cyan-500/25 transition-all duration-300">
                    {/* Video Thumbnail Placeholder */}
                    <div className="h-32 bg-gradient-to-br from-cyan-500/20 to-blue-600/20 flex items-center justify-center relative">
                      <Play className="h-12 w-12 text-white/80 group-hover:text-cyan-400 transition-colors" />
                      <div className="absolute top-3 right-3">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-bold ${getStatusBadgeClasses(video.status)}`}>
                          {getStatusIcon(video.status)} {video.status}
                        </span>
                      </div>
                    </div>
                    
                    <div className="p-4">
                      <h3 className="font-semibold text-white truncate group-hover:text-cyan-400 transition-colors mb-2">
                        {video.title}
                      </h3>
                      
                      <div className="flex items-center justify-between text-sm text-cyan-100 mb-3">
                        <span className="flex items-center">
                          <Clock className="w-3 h-3 mr-1" />
                          {new Date(video.uploadedAt).toLocaleDateString()}
                        </span>
                        {video.fileSize && (
                          <span>{formatFileSize(video.fileSize)}</span>
                        )}
                      </div>
                      
                      {video.description && (
                        <p className="text-cyan-100 text-sm line-clamp-2 mb-3">
                          {video.description}
                        </p>
                      )}
                      
                      {video.transcript && (
                        <div className="flex items-center text-cyan-400 text-sm">
                          <FileText className="w-3 h-3 mr-1" />
                          Transcript available
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
            
            {/* Pagination */}
            {state.pagination && state.pagination.pages > 1 && (
              <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-cyan-100 text-sm">
                  Showing {((state.pagination.page - 1) * state.pagination.limit) + 1} to{' '}
                  {Math.min(state.pagination.page * state.pagination.limit, state.pagination.total)} of{' '}
                  {state.pagination.total} videos
                </div>
                
                <div className="flex space-x-2">
                  <button
                    onClick={() => handlePageChange(state.pagination!.page - 1)}
                    disabled={state.pagination.page <= 1}
                    className="px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-cyan-100 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>
                  
                  <span className="px-4 py-2 text-cyan-100 text-sm">
                    Page {state.pagination.page} of {state.pagination.pages}
                  </span>
                  
                  <button
                    onClick={() => handlePageChange(state.pagination!.page + 1)}
                    disabled={state.pagination.page >= state.pagination.pages}
                    className="px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-cyan-100 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Upload Modal */}
      {state.showUploadModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-lg flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 rounded-2xl p-6 w-full max-w-md border border-cyan-500/20 shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-4">Upload New Video</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-cyan-100 text-sm mb-2">Video File</label>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="video/*"
                  onChange={handleFileSelect}
                  className="w-full text-cyan-100 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-cyan-500 file:text-white hover:file:bg-cyan-600"
                />
              </div>
              
              <div>
                <label className="block text-cyan-100 text-sm mb-2">Title</label>
                <input
                  type="text"
                  value={uploadForm.title}
                  onChange={(e) => setUploadForm(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  placeholder="Enter video title"
                />
              </div>
              
              <div>
                <label className="block text-cyan-100 text-sm mb-2">Description</label>
                <textarea
                  value={uploadForm.description}
                  onChange={(e) => setUploadForm(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  placeholder="Enter video description"
                  rows={3}
                />
              </div>
              
              <div>
                <label className="block text-cyan-100 text-sm mb-2">Language</label>
                <select
                  value={uploadForm.language}
                  onChange={(e) => setUploadForm(prev => ({ ...prev, language: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="english">English</option>
                  <option value="spanish">Spanish</option>
                  <option value="french">French</option>
                  <option value="german">German</option>
                  <option value="hindi">Hindi</option>
                  <option value="chinese">Chinese</option>
                </select>
              </div>
            </div>
            
            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => setState(prev => ({ ...prev, showUploadModal: false }))}
                className="flex-1 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors"
                disabled={state.isUploading}
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={state.isUploading || !uploadForm.file}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg font-semibold hover:from-cyan-600 hover:to-blue-700 disabled:opacity-50 transition-all"
              >
                {state.isUploading ? 'Uploading...' : 'Upload Video'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}