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

// Validate required environment variables
const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
if (!clerkPublishableKey) {
  console.error('❌ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is missing. Clerk authentication will not work.');
}

export const metadata: Metadata = {
  title: {
    default: 'VideoExplainer AI - Intelligent Video Analysis Platform',
    template: '%s | VideoExplainer AI'
  },
  description: 'Upload videos and get AI-powered insights, transcriptions, and answers to your questions. Advanced video analysis with cutting-edge AI technology.',
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0f172a',
  colorScheme: 'dark',
};

interface RootLayoutProps {
  children: React.ReactNode;
}


// Enhanced Clerk configuration with fallback UI
const clerkAppearance = {
  elements: {
    formButtonPrimary: 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2',
    card: 'bg-slate-800 border border-slate-700 shadow-2xl rounded-2xl',
    headerTitle: 'text-white font-bold',
    headerSubtitle: 'text-cyan-100',
    socialButtonsBlockButton: 'border-slate-600 text-slate-100 hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-400',
    formFieldInput: 'bg-slate-700 border-slate-600 text-white focus:border-cyan-500 focus:ring-2 focus:ring-cyan-400',
    footerActionLink: 'text-cyan-400 hover:text-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-400 rounded-md',
    formFieldLabel: 'text-cyan-100 font-medium',
    alert: 'bg-amber-500/10 border-amber-500/20 text-amber-200',
  },
  variables: {
    colorPrimary: '#06b6d4',
    colorBackground: '#0f172a',
    colorText: '#ffffff',
    colorTextSecondary: '#cbd5e1',
    colorInputBackground: '#1e293b',
    colorInputText: '#ffffff',
  }
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <ClerkProvider
    publishableKey={clerkPublishableKey}
    appearance={clerkAppearance}
    >
      <html lang="en" className="scroll-smooth" suppressHydrationWarning>
        <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
          
          {/* Preload critical resources */}
          {/* <link rel="preload" href={inter.style.fontFamily} as="font" type="font/woff2" crossOrigin="anonymous" /> */}
          
          {/* Security headers (via meta tags where possible) */}
          {/* <meta httpEquiv="Content-Security-Policy" content={`
            default-src 'self';
            script-src 'self' 'unsafe-eval' 'unsafe-inline' https://js.live-video.net;
            style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
            font-src 'self' https://fonts.gstatic.com;
            img-src 'self' data: https: blob:;
            media-src 'self' https: blob:;
            connect-src 'self' https: wss:;
            frame-src 'self' https://js.live-video.net;
            base-uri 'self';
            form-action 'self';
          `.replace(/\s+/g, ' ').trim()} />
           */}
          
          {/* <meta name="referrer" content="strict-origin-when-cross-origin" />
          <meta name="format-detection" content="telephone=no" />
          <meta name="msapplication-TileColor" content="#06b6d4" /> */}

          
          {/* Performance optimizations */}
          {/* <link rel="dns-prefetch" href="//js.live-video.net" />
          <link rel="preconnect" href="https://js.live-video.net" /> */}
        </head>
        <body className={`${inter.className} antialiased bg-slate-900 text-white`}>
          <ErrorBoundary>
          <div id="root" className="min-h-screen" role="main">
              {children}
            </div>
            
            {/* Enhanced Toaster with accessibility */}
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
                  maxWidth: '500px',
                },
                ariaProps: {
                  role: 'status',
                  'aria-live': 'polite',
                },
                success: {
                  iconTheme: {
                    primary: '#10b981',
                    secondary: '#fff',
                  },
                  ariaProps: {
                    'aria-live': 'assertive',
                    role: 'status'
                  },
                },
                error: {
                  duration: 7000,
                  iconTheme: {
                    primary: '#ef4444',
                    secondary: '#fff',
                  },
                  ariaProps: {
                    'aria-live': 'assertive',
                    role: 'alert'
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
          {/* Enhanced Skip to main content for accessibility */}
          {/* <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-gradient-to-r from-cyan-500 to-blue-600 text-white px-4 py-2 rounded-xl font-semibold z-50 transform transition-transform focus:scale-105"
            aria-label="Skip to main content"
          >
            Skip to main content
          </a> */}
        </body>
      </html>
    </ClerkProvider>
  );
}