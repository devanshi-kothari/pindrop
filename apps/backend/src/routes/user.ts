import { Router } from 'express';
import { userController } from '../controllers/userController';
import { authenticateToken } from '../middleware/auth';
import { validateRequest } from '../middleware/validateRequest';
import { userSchemas } from '../schemas/userSchemas';

const router = Router();

// All user routes require authentication
router.use(authenticateToken);

// User routes
router.get('/profile', userController.getProfile);
router.put('/profile', 
  validateRequest(userSchemas.updateProfile),
  userController.updateProfile
);
router.delete('/profile', userController.deleteProfile);

export default router;
