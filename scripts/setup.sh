#!/bin/bash

# Pindrop Monorepo Setup Script
echo "🚀 Setting up Pindrop Monorepo..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18+ is required. Current version: $(node -v)"
    exit 1
fi

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

echo "✅ Prerequisites check passed"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Set up environment files
echo "🔧 Setting up environment files..."

# Backend environment
if [ ! -f "apps/backend/.env" ]; then
    cp apps/backend/env.example apps/backend/.env
    echo "✅ Created apps/backend/.env"
else
    echo "⚠️  apps/backend/.env already exists"
fi

# Frontend environment
if [ ! -f "apps/frontend/.env" ]; then
    cat > apps/frontend/.env << EOF
VITE_API_URL=http://localhost:3001
EOF
    echo "✅ Created apps/frontend/.env"
else
    echo "⚠️  apps/frontend/.env already exists"
fi

# Create logs directory
mkdir -p apps/backend/logs
echo "✅ Created logs directory"

# Start Docker services
echo "🐳 Starting Docker services..."
docker-compose up -d postgres

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to be ready..."
sleep 10

# Run database migrations
echo "🗄️  Running database migrations..."
cd apps/backend
npm run db:generate
npm run db:migrate
npm run db:seed
cd ../..

echo "🎉 Setup complete!"
echo ""
echo "To start the development servers:"
echo "  npm run dev"
echo ""
echo "Or start individual services:"
echo "  npm run dev:backend"
echo "  npm run dev:frontend"
echo ""
echo "To stop Docker services:"
echo "  npm run docker:down"
echo ""
echo "Happy coding! 🚀"
