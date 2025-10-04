import { Request, Response } from 'express';
import { prisma } from '../index';
import { logger } from '../utils/logger';
import { AppError } from '../utils/AppError';

export const userController = {
  async getProfile(req: Request, res: Response) {
    try {
      const userId = (req as any).userId;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          createdAt: true,
          updatedAt: true
        }
      });

      if (!user) {
        throw new AppError('User not found', 404);
      }

      res.json({ user });
    } catch (error) {
      logger.error('Get profile error:', error);
      if (error instanceof AppError) {
        res.status(error.statusCode).json({ message: error.message });
      } else {
        res.status(500).json({ message: 'Internal server error' });
      }
    }
  },

  async updateProfile(req: Request, res: Response) {
    try {
      const userId = (req as any).userId;
      const { name, email } = req.body;

      // Check if email is already taken by another user
      if (email) {
        const existingUser = await prisma.user.findFirst({
          where: {
            email,
            id: { not: userId }
          }
        });

        if (existingUser) {
          throw new AppError('Email already taken', 400);
        }
      }

      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          ...(name && { name }),
          ...(email && { email })
        },
        select: {
          id: true,
          email: true,
          name: true,
          updatedAt: true
        }
      });

      logger.info(`User profile updated: ${user.email}`);

      res.json({
        message: 'Profile updated successfully',
        user
      });
    } catch (error) {
      logger.error('Update profile error:', error);
      if (error instanceof AppError) {
        res.status(error.statusCode).json({ message: error.message });
      } else {
        res.status(500).json({ message: 'Internal server error' });
      }
    }
  },

  async deleteProfile(req: Request, res: Response) {
    try {
      const userId = (req as any).userId;

      // Delete user and all related data
      await prisma.user.delete({
        where: { id: userId }
      });

      logger.info(`User deleted: ${userId}`);

      res.json({ message: 'Profile deleted successfully' });
    } catch (error) {
      logger.error('Delete profile error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
};
