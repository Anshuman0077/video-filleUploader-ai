"use client"
import { useUser, SignInButton, SignUpButton } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'


export default function Home() {
  const { isSignedIn } = useUser()
  const router = useRouter()

  useEffect(() => {
    if (isSignedIn) {
      router.push('/dashboard')
    }
  }, [isSignedIn, router])

  if (isSignedIn) {
    return null
  }
  
  


  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8">


    <div className="sm:mx-auto sm:w-full sm:max-w-md">
      <h1 className="text-center text-3xl font-extrabold text-gray-900">
        VideoExplainer
      </h1>
      <p className="mt-2 text-center text-sm text-gray-600">
        Upload videos and ask questions about their content
      </p>
    </div>

    <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
      <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
        <div className="flex flex-col space-y-4">
          <SignInButton mode="modal">
            <button className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
              Sign in
            </button>
          </SignInButton>
          
          <SignUpButton mode="modal">
            <button className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
              Sign up
            </button>
          </SignUpButton>
        </div>
      </div>
    </div>
  </div>
      



  );
}
