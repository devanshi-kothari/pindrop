import Joi from 'joi';

export const userSchemas = {
  updateProfile: Joi.object({
    name: Joi.string().min(2).max(50).optional().messages({
      'string.min': 'Name must be at least 2 characters long',
      'string.max': 'Name must not exceed 50 characters'
    }),
    email: Joi.string().email().optional().messages({
      'string.email': 'Please provide a valid email address'
    })
  })
};
