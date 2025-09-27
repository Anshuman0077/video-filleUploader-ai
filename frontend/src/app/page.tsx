'use client'

import { useUser, SignInButton, SignUpButton } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { 
  Brain, Zap, Play, MessageCircle, 
  FileText, Sparkles, ArrowRight,
  CheckCircle, Video, Shield
} from 'lucide-react'

export default function Home() {
  const { isSignedIn } = useUser()
  const router = useRouter()

  useEffect(() => {
    if (isSignedIn) {
      router.push('/dashboard')
    }
  }, [isSignedIn, router])

  const features = [
    {
      icon: Brain,
      title: 'AI-Powered Analysis',
      description: 'Advanced machine learning algorithms analyze your video content with precision'
    },
    {
      icon: MessageCircle,
      title: 'Intelligent Q&A',
      description: 'Ask any question about your video and get instant, accurate answers'
    },
    {
      icon: FileText,
      title: 'Auto Transcription',
      description: 'Automatic speech-to-text transcription with high accuracy'
    },
    {
      icon: Zap,
      title: 'Real-time Processing',
      description: 'Fast processing with real-time progress updates'
    },
    {
      icon: Shield,
      title: 'Secure & Private',
      description: 'Your videos are processed securely with enterprise-grade encryption'
    },
    {
      icon: Sparkles,
      title: 'Multi-language',
      description: 'Support for multiple languages and dialects'
    }
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-cyan-500/10 via-slate-900 to-slate-900"></div>
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
          <div className="text-center">
            <div className="flex justify-center mb-6">
              <div className="bg-gradient-to-r from-cyan-500 to-blue-600 p-3 rounded-2xl shadow-2xl">
                <Brain className="h-12 w-12 text-white" />
              </div>
            </div>
            
            <h1 className="text-5xl lg:text-7xl font-bold bg-gradient-to-r from-cyan-400 via-blue-500 to-cyan-400 bg-clip-text text-transparent animate-gradient-x">
              VideoExplainer AI
            </h1>
            
            <p className="mt-6 text-xl lg:text-2xl text-cyan-100 max-w-4xl mx-auto leading-relaxed">
              Transform your videos into interactive knowledge bases with cutting-edge AI technology. 
              Upload, analyze, and converse with your video content like never before.
            </p>
            
            <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
              <SignInButton mode="modal">
                <button className="group relative bg-gradient-to-r from-cyan-500 to-blue-600 text-white px-8 py-4 rounded-xl font-bold text-lg shadow-2xl transition-all duration-300 transform hover:scale-105 hover:from-cyan-600 hover:to-blue-700">
                  <span className="flex items-center">
                    Get Started
                    <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </span>
                  <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300 -z-10 blur-lg"></div>
                </button>
              </SignInButton>
              
              <SignUpButton mode="modal">
                <button className="border border-cyan-500/30 text-cyan-400 px-8 py-4 rounded-xl font-bold text-lg backdrop-blur-lg transition-all duration-300 hover:bg-cyan-500/10 hover:border-cyan-400">
                  Create Account
                </button>
              </SignUpButton>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="relative py-20 lg:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl lg:text-5xl font-bold text-white mb-4">
              Powerful Features
            </h2>
            <p className="text-xl text-cyan-100 max-w-3xl mx-auto">
              Everything you need to unlock the full potential of your video content
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div 
                key={index}
                className="group bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-all duration-300 transform hover:scale-105 hover:shadow-2xl"
              >
                <div className="bg-gradient-to-r from-cyan-500 to-blue-600 p-3 rounded-xl w-fit mb-4 group-hover:scale-110 transition-transform">
                  <feature.icon className="h-6 w-6 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">{feature.title}</h3>
                <p className="text-cyan-100 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="relative py-20 lg:py-32 bg-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl lg:text-5xl font-bold text-white mb-4">
              How It Works
            </h2>
            <p className="text-xl text-cyan-100">
              Simple steps to transform your videos into interactive experiences
            </p>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {[
              { step: '01', title: 'Upload Video', desc: 'Upload your video file securely', icon: Video },
              { step: '02', title: 'AI Processing', desc: 'Our AI analyzes and transcribes content', icon: Zap },
              { step: '03', title: 'Ask Questions', desc: 'Interact with your video content', icon: MessageCircle },
              { step: '04', title: 'Get Insights', desc: 'Receive detailed answers and summaries', icon: Sparkles }
            ].map((item, index) => (
              <div key={index} className="text-center">
                <div className="relative">
                  <div className="bg-gradient-to-r from-cyan-500 to-blue-600 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-white font-bold text-xl">
                    {item.step}
                  </div>
                  <item.icon className="h-8 w-8 text-cyan-400 absolute -top-2 -right-2" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{item.title}</h3>
                <p className="text-cyan-100">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative py-20 lg:py-32">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <h2 className="text-4xl lg:text-5xl font-bold text-white mb-6">
            Ready to Transform Your Videos?
          </h2>
          <p className="text-xl text-cyan-100 mb-8">
            Join thousands of users who are already unlocking the power of AI video analysis
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <SignUpButton mode="modal">
              <button className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white px-8 py-4 rounded-xl font-bold text-lg hover:from-cyan-600 hover:to-blue-700 transition-all transform hover:scale-105">
                Start Free Trial
              </button>
            </SignUpButton>
            
            <button className="border border-cyan-500/30 text-cyan-400 px-8 py-4 rounded-xl font-bold text-lg hover:bg-cyan-500/10 transition-all">
              Watch Demo
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}