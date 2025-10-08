# Pindrop - Social Media Platform

A modern social media platform built with Express.js backend and React frontend, designed as a monorepo to support multiple backend services. Pindrop allows users to create posts, follow other users, like content, and interact through comments.

## 🏗️ Architecture

This monorepo contains:

- **Backend** (`apps/backend`): Express.js API server with TypeScript
- **Frontend** (`apps/frontend`): React application with Vite and TypeScript
- **Shared** (`packages/shared`): Common utilities, types, and constants
- **Services** (`services/`): Future microservices (ready for expansion)

## 🚀 Tech Stack

### Backend
- **Node.js** with **Express.js**
- **TypeScript** for type safety
- **MySQL** with custom database service
- **JWT** for authentication
- **Winston** for logging
- **Joi** for validation

### Frontend
- **React 18** with **TypeScript**
- **Vite** for fast development
- **React Router** for routing
- **React Query** for data fetching
- **React Hook Form** for forms
- **Tailwind CSS** for styling
- **Lucide React** for icons

### Database
- **MySQL** 8.0
- **Custom database service** for data management

### Development
- **Docker** and **Docker Compose** for containerization
- **ESLint** and **Prettier** for code quality
- **Concurrently** for running multiple services

## 📁 Project Structure

```
pindrop/
├── apps/
│   ├── backend/                 # Express.js API server
│   │   ├── src/
│   │   │   ├── controllers/     # Route controllers
│   │   │   ├── middleware/      # Express middleware
│   │   │   ├── routes/          # API routes
│   │   │   ├── schemas/         # Validation schemas
│   │   │   ├── utils/           # Utility functions
│   │   │   └── index.ts         # Application entry point
│   │   ├── src/
│   │   │   ├── services/        # Database service
│   │   └── package.json
│   └── frontend/                # React application
│       ├── src/
│       │   ├── components/      # React components
│       │   ├── contexts/        # React contexts
│       │   ├── hooks/           # Custom hooks
│       │   ├── pages/           # Page components
│       │   ├── services/        # API services
│       │   ├── types/           # TypeScript types
│       │   └── main.tsx         # Application entry point
│       └── package.json
├── packages/
│   └── shared/                  # Shared utilities and types
│       ├── src/
│       │   ├── types/           # Common TypeScript types
│       │   ├── utils/           # Utility functions
│       │   └── constants/       # Application constants
│       └── package.json
├── services/                    # Future microservices
├── apps/
│   └── models/                  # Database models and setup
├── scripts/                     # Development scripts
├── docker-compose.yml           # Docker services configuration
└── package.json                 # Root package.json with workspaces
```

## 🛠️ Getting Started

### Prerequisites

- **Node.js** 18+ 
- **npm** 9+
- **Docker** and **Docker Compose**
- **MySQL** (if running locally)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd pindrop
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   # Backend
   cp apps/backend/env.example apps/backend/.env
   
   # Frontend
   cp apps/frontend/.env.example apps/frontend/.env
   ```

4. **Start with Docker (Recommended)**
   ```bash
   npm run docker:up
   ```

   Or start individual services:
   ```bash
   # Start database
   docker-compose up mysql -d
   
   # Setup database tables
   npm run db:setup
   
   # Start backend
   npm run dev:backend
   
   # Start frontend (in another terminal)
   npm run dev:frontend
   ```

### Development Commands

```bash
# Install dependencies for all workspaces
npm install

# Start all services in development mode
npm run dev

# Start individual services
npm run dev:backend
npm run dev:frontend

# Build all applications
npm run build

# Run tests
npm run test

# Lint code
npm run lint

# Database operations
npm run db:setup
npm run db:seed

# Docker operations
npm run docker:up
npm run docker:down
npm run docker:build
```

## 🗄️ Database

The application uses MySQL with a custom database service. Database operations are handled through the custom service:

```bash
# Setup database tables
npm run db:setup

# Seed the database
npm run db:seed
```

## 🔐 Authentication

The application uses JWT-based authentication:

- **Access tokens** expire in 15 minutes
- **Refresh tokens** expire in 7 days
- Tokens are stored in HTTP-only cookies (recommended for production)
- Automatic token refresh on API calls

## 🌐 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user (username, first_name, last_name, email, password)
- `POST /api/auth/login` - Login user (email, password)
- `POST /api/auth/logout` - Logout user
- `POST /api/auth/refresh` - Refresh access token

### Users
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update user profile (username, first_name, last_name, email, bio, profile_picture)
- `DELETE /api/users/profile` - Delete user account

### Posts (Future)
- `GET /api/posts` - Get posts feed
- `POST /api/posts` - Create new post
- `GET /api/posts/:id` - Get specific post
- `PUT /api/posts/:id` - Update post
- `DELETE /api/posts/:id` - Delete post
- `POST /api/posts/:id/like` - Like/unlike post

### Social Features (Future)
- `GET /api/users/:id/followers` - Get user followers
- `GET /api/users/:id/following` - Get user following
- `POST /api/users/:id/follow` - Follow user
- `DELETE /api/users/:id/follow` - Unfollow user

### Health Check
- `GET /health` - Application health status

## 🚀 Deployment

### Production Build

```bash
# Build all applications
npm run build

# Start production server
npm run start
```

### Docker Production

```bash
# Build production images
docker-compose -f docker-compose.prod.yml build

# Start production services
docker-compose -f docker-compose.prod.yml up -d
```

## 🔧 Adding New Services

To add a new backend service:

1. Create a new directory in `services/`
2. Add a `package.json` with the service name `@pindrop/service-name`
3. Update the root `package.json` workspaces array
4. Add the service to `docker-compose.yml`

Example:
```bash
mkdir services/notification-service
cd services/notification-service
npm init -y
# Configure the service...
```

## 📝 Environment Variables

### Backend (.env)
```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=pindrop_user
DB_PASSWORD=pindrop_password
DB_NAME=pindrop_db
JWT_SECRET="your-super-secret-jwt-key-here"
JWT_REFRESH_SECRET="your-super-secret-refresh-key-here"
PORT=3001
NODE_ENV=development
FRONTEND_URL="http://localhost:3000"
LOG_LEVEL=info
```

### Frontend (.env)
```env
VITE_API_URL="http://localhost:3001"
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For support and questions, please open an issue in the repository.