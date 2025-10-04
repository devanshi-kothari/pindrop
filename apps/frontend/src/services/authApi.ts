import { api } from './api'
import { AuthResponse, LoginRequest, RegisterRequest, User } from '../types/user'

export const authApi = {
  async login(email: string, password: string): Promise<AuthResponse> {
    const response = await api.post<AuthResponse>('/api/auth/login', {
      email,
      password
    })
    return response.data
  },

  async register(name: string, email: string, password: string): Promise<AuthResponse> {
    const response = await api.post<AuthResponse>('/api/auth/register', {
      name,
      email,
      password
    })
    return response.data
  },

  async logout(refreshToken: string): Promise<void> {
    await api.post('/api/auth/logout', { refreshToken })
  },

  async getProfile(): Promise<User> {
    const response = await api.get<{ user: User }>('/api/users/profile')
    return response.data.user
  }
}
