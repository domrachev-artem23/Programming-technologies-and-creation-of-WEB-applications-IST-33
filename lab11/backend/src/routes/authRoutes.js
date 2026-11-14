import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { createAuthController } from '../controllers/authController.js';
import { asyncRoute } from '../utils/asyncRoute.js';
import { createAuth } from '../middleware/auth.js';

export function createAuthRoutes(pool, jwtSecret) {
  const router = Router();
  const controller = createAuthController(pool, jwtSecret);
  const auth = createAuth(pool, jwtSecret);
  router.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }));
  router.post('/register', asyncRoute(controller.register));
  router.post('/login', asyncRoute(controller.login));
  router.get('/me', auth, controller.me);
  return router;
}
