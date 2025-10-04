// User types
export interface User {
  id: string
  email: string
  name: string
  createdAt: string
  updatedAt?: string
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  message?: string
  error?: string
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

// Auth types
export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface RegisterRequest {
  name: string
  email: string
  password: string
}

export interface AuthResponse extends AuthTokens {
  user: User
}

// Common types
export interface BaseEntity {
  id: string
  createdAt: string
  updatedAt: string
}

export interface PaginationParams {
  page?: number
  limit?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

// Error types
export interface ApiError {
  message: string
  statusCode: number
  field?: string
}

// Service types
export interface ServiceConfig {
  name: string
  port: number
  version: string
  environment: 'development' | 'staging' | 'production'
}
