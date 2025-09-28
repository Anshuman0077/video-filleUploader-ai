'use client';

import { useState, useEffect, useRef } from 'react';
import { useUser, useAuth } from '@clerk/nextjs';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { ReactPlayerProps } from 'react-player';
import { Video, Message, ProcessingProgress } from '@/types';
import { ApiClientError } from '@/lib/api';
import { apiClient } from '@/lib/api';
import { socketService } from '@/lib/socket';
import { getStatusBadgeClasses, getStatusIcon, getStatusDescription } from '@/lib/statusStyles';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Brain, MessageCircle, FileText, 
  Clock, AlertCircle, Zap, Sparkles
} from 'lucide-react';

const ReactPlayer = dynamic<ReactPlayerProps>(() => import('react-player'), { 
  ssr: false,
  loading: () => <div className="w-full h-96 bg-gradient-to-br from-cyan-500/20 to-blue-600/20 flex items-center justify-center rounded-2xl">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400"></div>
  </div>
});

// Simple Send icon component
const Send = ({ className }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
  </svg>
);

export default function VideoPage() {
  const { isSignedIn, isLoaded } = useUser();
  const { getToken } = useAuth();
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  
  const [video, setVideo] = useState<Video | null>(null);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState<ProcessingProgress | null>(null);
  const [activeTab, setActiveTab] = useState<'chat' | 'transcript' | 'summary'>('chat');
  const [isPlaying, setIsPlaying] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);

  useEffect(() => {
    if (!isSignedIn && isLoaded) {
      router.push('/sign-in');
      return;
    }

    const fetchVideoData = async () => {
      try {
        const [videoData, questionsData] = await Promise.all([
          apiClient.getVideo(id),
          apiClient.getVideoQuestions(id),
        ]);
        
        setVideo(videoData);
        setIsProcessing(videoData.status === 'processing' || videoData.status === 'queued');
        
        // Convert questions to messages
        const historyMessages: Message[] = questionsData.flatMap((q: any) => [
          { 
            type: 'user' as const, 
            content: q.question, 
            timestamp: new Date(q.askedAt),
            videoId: id
          },
          { 
            type: 'ai' as const, 
            content: q.answer, 
            timestamp: new Date(q.askedAt),
            videoId: id
          },
        ]);
        
        setMessages(historyMessages);
        
      } catch (error) {
        const apiError = error as ApiClientError;
        console.error('Error fetching video data:', apiError);
        toast.error(apiError.message || 'Failed to load video');
        if (apiError.status === 401) {
          router.push('/sign-in');
        } else {
          router.push('/dashboard');
        }
      }
    };

    if (id && isSignedIn) {
      fetchVideoData();
    }
  }, [id, isSignedIn, isLoaded, router]);

  useEffect(() => {
    // Setup socket connection for real-time updates
    if (video && (video.status === 'processing' || video.status === 'queued')) {
      const setupSocket = async () => {
        const token = await getToken();
        if (token) {
          const socket = socketService.connect(id, token);
          
          socket.on('video-processed', (data) => {
            if (data.videoId === id) {
              setIsProcessing(false);
              setProcessingProgress(null);
              // Refresh video data
              apiClient.getVideo(id).then(setVideo);
              toast.success('Video processing completed!');
            }
          });

          socket.on('processing-progress', (data) => {
            if (data.videoId === id) {
              setProcessingProgress(data);
            }
          });

          socket.on('error', (error) => {
            toast.error(error.message);
          });
        }
      };
      
      setupSocket();
      
      return () => {
        socketService.disconnect();
      };
    }
  }, [video, id, getToken]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmitQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || isLoading || !video) return;

    setIsLoading(true);
    const userMessage = question;
    setQuestion('');
    
    // Add user message immediately
    const newUserMessage: Message = {
      type: 'user',
      content: userMessage,
      timestamp: new Date(),
      videoId: id
    };
    
    setMessages(prev => [...prev, newUserMessage]);

    try {
      const result = await apiClient.askQuestion(id, userMessage, video.language);
      
      const aiMessage: Message = {
        type: 'ai',
        content: result.answer,
        timestamp: new Date(),
        videoId: id
      };
      
      setMessages(prev => [...prev, aiMessage]);
      toast.success('Question answered!');
    } catch (error: any) {
      console.error('Error asking question:', error);
      
      const errorMessage: Message = {
        type: 'ai',
        content: 'Sorry, I encountered an error processing your question. Please try again.',
        timestamp: new Date(),
        videoId: id
      };
      
      setMessages(prev => [...prev, errorMessage]);
      toast.error('Failed to get answer. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const generateSummary = async () => {
    if (!video) return;
    
    try {
      const result = await apiClient.generateSummary(id, video.language);
      setVideo(prev => prev ? { ...prev, summary: result.summary } : null);
      toast.success('Summary generated successfully!');
    } catch (error) {
      toast.error('Failed to generate summary');
    }
  };

  const handleBackToDashboard = () => {
    router.push('/dashboard');
  };

  if (!video) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-cyan-400 mx-auto mb-4"></div>
          <p className="text-cyan-100 text-lg">Loading video...</p>
        </div>
      </div>
    );
  }

  const canAskQuestions = video.status === 'completed' && !isProcessing;
  const videoUrl = video.cloudinaryUrl || video.url;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Header */}
      <header className="bg-black/30 backdrop-blur-lg border-b border-white/10 shadow-2xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <button 
            onClick={handleBackToDashboard}
            className="flex items-center text-cyan-100 hover:text-cyan-400 transition-colors"
          >
            <ArrowLeft className="h-5 w-5 mr-2" />
            Back to Dashboard
          </button>
          
          <div className="flex items-center space-x-4">
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-bold ${getStatusBadgeClasses(video.status)}`}>
              {getStatusIcon(video.status)} {video.status}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Video Info */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent mb-2">
            {video.title}
          </h1>
          <p className="text-cyan-100 text-lg">{video.description}</p>
          
          <div className="flex items-center space-x-6 mt-4 text-cyan-100">
            <span className="flex items-center">
              <Clock className="h-4 w-4 mr-2" />
              Uploaded {new Date(video.uploadedAt).toLocaleDateString()}
            </span>
            {video.fileSize && (
              <span>{Math.round(video.fileSize / (1024 * 1024))} MB</span>
            )}
            {video.language && (
              <span className="capitalize">{video.language}</span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          {/* Video Player Section */}
          <div className="xl:col-span-2">
            <div className="bg-black/30 backdrop-blur-lg rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
              {canAskQuestions && videoUrl ? (
                <div className="relative">
                  <ReactPlayer
                    ref={playerRef}
                    url={videoUrl}
                    controls
                    width="100%"
                    height="400px"
                    playing={isPlaying}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    config={{
                      file: {
                        attributes: {
                          controlsList: 'nodownload'
                        }
                      }
                    }}
                  />
                  <div className="absolute top-4 right-4">
                    <button 
                      onClick={() => playerRef.current?.seekTo(0)}
                      className="bg-black/50 text-white p-2 rounded-lg hover:bg-black/70 transition-colors"
                    >
                      <Sparkles className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="w-full h-96 bg-gradient-to-br from-cyan-500/20 to-blue-600/20 flex items-center justify-center rounded-2xl">
                  {isProcessing ? (
                    <div className="text-center">
                      <Zap className="h-12 w-12 text-yellow-400 animate-pulse mx-auto mb-4" />
                      <p className="text-cyan-100 text-lg">Video is being processed</p>
                      {processingProgress && (
                        <div className="mt-4">
                          <div className="w-64 bg-white/10 rounded-full h-2 mx-auto">
                            <div 
                              className="bg-gradient-to-r from-cyan-400 to-blue-500 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${processingProgress.progress}%` }}
                            ></div>
                          </div>
                          <p className="text-cyan-100 text-sm mt-2">
                            {processingProgress.phase} ({Math.round(processingProgress.progress)}%)
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center">
                      <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
                      <p className="text-cyan-100 text-lg">Video processing failed</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Tabs for Transcript and Summary */}
            {(video.transcript || video.summary) && (
              <div className="mt-6 bg-white/10 backdrop-blur-lg rounded-2xl border border-white/10 shadow-2xl">
                <div className="border-b border-white/10">
                  <nav className="flex space-x-8 px-6">
                    {video.transcript && (
                      <button
                        onClick={() => setActiveTab('transcript')}
                        className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                          activeTab === 'transcript'
                            ? 'border-cyan-400 text-cyan-400'
                            : 'border-transparent text-cyan-100 hover:text-cyan-400'
                        }`}
                      >
                        <FileText className="h-4 w-4 inline-block mr-2" />
                        Transcript
                      </button>
                    )}
                    {video.summary && (
                      <button
                        onClick={() => setActiveTab('summary')}
                        className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                          activeTab === 'summary'
                            ? 'border-cyan-400 text-cyan-400'
                            : 'border-transparent text-cyan-100 hover:text-cyan-400'
                        }`}
                      >
                        <Brain className="h-4 w-4 inline-block mr-2" />
                        AI Summary
                      </button>
                    )}
                  </nav>
                </div>
                
                <div className="p-6 max-h-96 overflow-y-auto">
                  {activeTab === 'transcript' && video.transcript && (
                    <div className="prose prose-invert max-w-none">
                      <p className="text-cyan-100 whitespace-pre-wrap leading-relaxed">
                        {video.transcript}
                      </p>
                    </div>
                  )}
                  
                  {activeTab === 'summary' && video.summary && (
                    <div className="prose prose-invert max-w-none">
                      <p className="text-cyan-100 whitespace-pre-wrap leading-relaxed">
                        {video.summary}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Chat Interface Section */}
          <div className="xl:col-span-1">
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl border border-white/10 shadow-2xl h-[600px] flex flex-col">
              <div className="px-6 py-4 border-b border-white/10">
                <h3 className="text-lg font-semibold text-white flex items-center">
                  <MessageCircle className="h-5 w-5 mr-2 text-cyan-400" />
                  AI Video Assistant
                </h3>
                <p className="text-cyan-100 text-sm mt-1">
                  {canAskQuestions 
                    ? 'Ask questions about this video' 
                    : getStatusDescription(video.status)
                  }
                </p>
              </div>
              
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                {!canAskQuestions ? (
                  <div className="text-center py-8">
                    <Zap className="h-12 w-12 text-yellow-400 animate-pulse mx-auto mb-4" />
                    <p className="text-cyan-100">
                      {video.status === 'queued' 
                        ? 'Video is queued for processing. You can ask questions once it is complete.'
                        : 'Video is being processed. You can ask questions once it is complete.'
                      }
                    </p>
                  </div>
                ) : (
                  <>
                    {messages.length === 0 ? (
                      <div className="text-center py-8">
                        <Brain className="h-12 w-12 text-cyan-400 mx-auto mb-4" />
                        <p className="text-cyan-100">No questions yet. Ask something about the video!</p>
                        <p className="text-cyan-100 text-sm mt-2">Try asking about specific content or request a summary</p>
                      </div>
                    ) : (
                      messages.map((message, index) => (
                        <div
                          key={index}
                          className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-xs md:max-w-md rounded-2xl px-4 py-3 shadow-lg ${
                              message.type === 'user'
                                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white'
                                : 'bg-white/20 text-cyan-100 backdrop-blur-lg'
                            }`}
                          >
                            <div className="flex items-center mb-1">
                              {message.type === 'user' ? (
                                <span className="text-xs opacity-80">You</span>
                              ) : (
                                <Brain className="h-3 w-3 mr-1" />
                              )}
                            </div>
                            {message.content}
                          </div>
                        </div>
                      ))
                    )}
                    {isLoading && (
                      <div className="flex justify-start">
                        <div className="bg-white/20 text-cyan-100 rounded-2xl px-4 py-3 backdrop-blur-lg">
                          <div className="flex items-center space-x-2">
                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-cyan-400"></div>
                            <span>AI is thinking...</span>
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>

              {canAskQuestions && (
                <div className="px-4 py-4 border-t border-white/10">
                  <form onSubmit={handleSubmitQuestion} className="flex space-x-2">
                    <input
                      type="text"
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      placeholder="Ask about this video..."
                      className="flex-1 bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-cyan-100 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent backdrop-blur-lg"
                      disabled={isLoading}
                    />
                    <button
                      type="submit"
                      className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white px-4 py-3 rounded-xl font-semibold hover:from-cyan-600 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-cyan-400 disabled:opacity-50 transition-all transform hover:scale-105"
                      disabled={isLoading || !question.trim()}
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </form>
                  
                  {!video.summary && (
                    <button
                      onClick={generateSummary}
                      className="w-full mt-3 bg-gradient-to-r from-purple-500 to-pink-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:from-purple-600 hover:to-pink-700 transition-all"
                    >
                      <Sparkles className="h-3 w-3 inline-block mr-1" />
                      Generate AI Summary
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}