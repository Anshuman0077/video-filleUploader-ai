import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import { Toaster } from 'react-hot-toast';

import ErrorBoundary from '@/components/ErrorBoundary';
import './globals.css';

const inter = Inter({ 
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'VideoExplainer AI - Intelligent Video Analysis Platform',
  description: 'Upload videos and get AI-powered insights, transcriptions, and answers to your questions. Advanced video analysis with cutting-edge AI technology.',
  keywords: ['video analysis', 'AI transcription', 'video questions', 'machine learning', 'video insights'],
  authors: [{ name: 'VideoExplainer AI Team' }],
  robots: 'index, follow',
  openGraph: {
    title: 'VideoExplainer AI - Intelligent Video Analysis',
    description: 'Advanced AI-powered video analysis platform with real-time insights and intelligent Q&A.',
    type: 'website',
    locale: 'en_US',
    siteName: 'VideoExplainer AI',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'VideoExplainer AI - Intelligent Video Analysis',
    description: 'Advanced AI-powered video analysis platform with real-time insights.',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0f172a',
};

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <ClerkProvider
      publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!}
      appearance={{
        elements: {
          formButtonPrimary: 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-sm font-semibold transition-all',
          card: 'bg-slate-800 border border-slate-700 shadow-2xl rounded-2xl',
          headerTitle: 'text-white font-bold',
          headerSubtitle: 'text-cyan-100',
          socialButtonsBlockButton: 'border-slate-600 text-slate-100 hover:bg-slate-700',
          formFieldInput: 'bg-slate-700 border-slate-600 text-white focus:border-cyan-500',
          footerActionLink: 'text-cyan-400 hover:text-cyan-300',
        },
        variables: {
          colorPrimary: '#06b6d4',
          colorBackground: '#0f172a',
        }
      }}
    >
      <html lang="en" className="scroll-smooth">
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link rel="icon" href="/favicon.ico" />
          <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
          <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
          <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        </head>
        <body className={`${inter.className} antialiased bg-slate-900 text-white`}>
          <ErrorBoundary>
            <div id="root" className="min-h-screen">
              {children}
            </div>
            
            {/* Enhanced Toaster */}
            <Toaster
              position="top-right"
              toastOptions={{
                duration: 5000,
                style: {
                  background: '#1e293b',
                  color: '#fff',
                  border: '1px solid #334155',
                  borderRadius: '12px',
                  backdropFilter: 'blur(10px)',
                },
                success: {
                  iconTheme: {
                    primary: '#10b981',
                    secondary: '#fff',
                  },
                },
                error: {
                  duration: 7000,
                  iconTheme: {
                    primary: '#ef4444',
                    secondary: '#fff',
                  },
                },
                loading: {
                  iconTheme: {
                    primary: '#06b6d4',
                    secondary: '#fff',
                  },
                },
              }}
            />
          </ErrorBoundary>
          
          {/* Enhanced Skip to main content */}
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-gradient-to-r from-cyan-500 to-blue-600 text-white px-4 py-2 rounded-xl font-semibold z-50 transform transition-transform focus:scale-105"
          >
            Skip to main content
          </a>
        </body>
      </html>
    </ClerkProvider>
  );
}