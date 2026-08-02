const { z } = require('zod');

const createUserSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(8),
    first_name: z.string().min(1),
    last_name: z.string().min(1),
  })
  .strict();

const updateUserSchema = z
  .object({
    first_name: z.string().min(1).optional(),
    last_name: z.string().min(1).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided.',
  });

const loginSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(1),
  })
  .strict();

module.exports = { createUserSchema, updateUserSchema, loginSchema };
