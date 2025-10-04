# Pindrop Monorepo

A modern web application built with Express.js backend and React frontend, designed as a monorepo to support multiple backend services.

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
- **PostgreSQL** with **Prisma** ORM
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
- **PostgreSQL** 15
- **Prisma** for database management and migrations

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
│   │   ├── prisma/              # Database schema and migrations
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
├── scripts/                     # Development scripts
├── docker-compose.yml           # Docker services configuration
└── package.json                 # Root package.json with workspaces
```

## 🛠️ Getting Started

### Prerequisites

- **Node.js** 18+ 
- **npm** 9+
- **Docker** and **Docker Compose**
- **PostgreSQL** (if running locally)

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
   docker-compose up postgres -d
   
   # Run database migrations
   npm run db:migrate
   
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
npm run db:migrate
npm run db:seed
npm run db:generate

# Docker operations
npm run docker:up
npm run docker:down
npm run docker:build
```

## 🗄️ Database

The application uses PostgreSQL with Prisma ORM. Database operations are handled through Prisma:

```bash
# Generate Prisma client
npm run db:generate

# Run migrations
npm run db:migrate

# Seed the database
npm run db:seed

# Open Prisma Studio
npm run db:studio
```

## 🔐 Authentication

The application uses JWT-based authentication:

- **Access tokens** expire in 15 minutes
- **Refresh tokens** expire in 7 days
- Tokens are stored in HTTP-only cookies (recommended for production)
- Automatic token refresh on API calls

## 🌐 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/logout` - Logout user
- `POST /api/auth/refresh` - Refresh access token

### Users
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update user profile
- `DELETE /api/users/profile` - Delete user account

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
DATABASE_URL="postgresql://username:password@localhost:5432/pindrop_db?schema=public"
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