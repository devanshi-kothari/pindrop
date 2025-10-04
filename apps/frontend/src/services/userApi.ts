import { api } from './api'
import { User } from '../types/user'

interface UpdateProfileRequest {
  name?: string
  email?: string
}

export const userApi = {
  async getProfile(): Promise<User> {
    const response = await api.get<{ user: User }>('/api/users/profile')
    return response.data.user
  },

  async updateProfile(data: UpdateProfileRequest): Promise<User> {
    const response = await api.put<{ user: User }>('/api/users/profile', data)
    return response.data.user
  },

  async deleteProfile(): Promise<void> {
    await api.delete('/api/users/profile')
  }
}
