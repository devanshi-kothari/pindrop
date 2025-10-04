import { Router } from 'express';
import { authController } from '../controllers/authController';
import { validateRequest } from '../middleware/validateRequest';
import { authSchemas } from '../schemas/authSchemas';

const router = Router();

// Auth routes
router.post('/register', 
  validateRequest(authSchemas.register),
  authController.register
);

router.post('/login', 
  validateRequest(authSchemas.login),
  authController.login
);

router.post('/logout', 
  authController.logout
);

router.post('/refresh', 
  authController.refreshToken
);

export default router;
