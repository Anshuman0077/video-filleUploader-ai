# Video File Uploader

This is a full-stack application for uploading videos, getting them transcribed, and asking questions about their content using AI.

## Features

- Video upload with progress tracking via WebSockets
- Cloud storage for videos (Cloudinary)
- Background processing for video transcription using queues (BullMQ)
- AI-powered transcription (OpenAI Whisper) and Q&A (Google Gemini)
- Real-time updates using WebSockets (Socket.io)
- User authentication (Clerk)
- Secure and robust backend with rate limiting, security headers, and CORS
- Modern frontend with Next.js and Tailwind CSS

## Tech Stack

- **Frontend:** Next.js, React, Tailwind CSS, Socket.io Client, Clerk
- **Backend:** Node.js, Express, MongoDB, Redis, Socket.io, BullMQ
- **Databases:** MongoDB (video metadata), Redis (queueing & caching)
- **Services:** Cloudinary (video storage), OpenAI (transcription), Clerk (auth)
- **Tooling:** Docker, Docker Compose, nodemon

## Getting Started

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

- **Node.js** (v18 or higher)
- **Docker** and **Docker Compose** (for running MongoDB and Redis)
- **Git** for version control

### 1. Clone the Repository

First, clone the repository to your local machine:

```bash
git clone <repository-url>
cd video-fileUploader
```

### 2. Configure Environment Variables

The application requires environment variables to connect to databases and external services.

#### Backend (`backend/.env`)

Create a `.env` file in the `backend` directory. You can copy the example file to get started:

```bash
cp backend/env.example backend/.env
```

Now, open `backend/.env` and fill in the values. For local development, you can use the following:

```env
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb://localhost:27017/video-uploader
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
FRONTEND_URL=http://localhost:3000

# Optional: Add API keys to enable all features
CLERK_SECRET_KEY=
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
OPENAI_API_KEY=

# To bypass authentication in development, set this to true
AUTH_BYPASS_DEV=true
```

> **Security Note:** The `.env` file contains sensitive credentials. **Do not commit this file to version control.** The `.gitignore` file is already configured to ignore `.env` files.

> **Note:** The backend can run in a limited capacity without the optional API keys. Authentication and video uploads will be mocked.

#### Frontend (`frontend/.env.local`)

Create a `.env.local` file in the `frontend` directory:

```bash
cp frontend/env.example frontend/.env.local
```

Open `frontend/.env.local` and add the following:

```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api

# Optional: Add your Clerk key to enable user authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
```

### 3. Start Dependent Services (MongoDB & Redis)

We use Docker Compose to easily run MongoDB and Redis. Make sure Docker is running on your machine, then run:

```bash
docker-compose up -d
```

- `-d` runs the containers in detached mode.
- To stop the services, run `docker-compose down`.

### 4. Install Dependencies

You'll need to install dependencies for both the frontend and backend. You can do this from the root directory.

```bash
# Install backend dependencies
npm install --prefix backend

# Install frontend dependencies
npm install --prefix frontend
```

### 5. Run the Application

Now you can start both the backend and frontend servers.

#### Start the Backend Server

```bash
# From the backend directory
cd backend
npm run dev
```

The backend server will start on `http://localhost:5000`.

#### Start the Frontend Server

```bash
# From the frontend directory
cd frontend
npm run dev
```

The frontend development server will start on `http://localhost:3000`.

Open `http://localhost:3000` in your browser to see the application.

## Troubleshooting

- **Network Error:** If the frontend shows a network error, ensure the backend server is running and accessible at `http://localhost:5000`. Check the console for any backend startup errors.
- **Database Connection Error:** Make sure the Docker containers for MongoDB and Redis are running. You can check their status with `docker-compose ps`.
- **CORS Issues:** The backend is configured to allow requests from `http://localhost:3000`. If you are running the frontend on a different port, update `FRONTEND_URL` in `backend/.env`.

## API Endpoints

A brief overview of the available API endpoints will be added here.

## Contributing

Contributions are welcome! Please feel free to submit a pull request.
