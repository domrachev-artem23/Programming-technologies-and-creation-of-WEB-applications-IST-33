import { Router } from 'express';
import { createCategoryController } from '../controllers/categoryController.js';
import { createAuth } from '../middleware/auth.js';
import { asyncRoute } from '../utils/asyncRoute.js';

export function createCategoryRoutes(pool, jwtSecret) {
  const router = Router();
  const controller = createCategoryController(pool);
  router.use(createAuth(pool, jwtSecret));
  router.get('/', asyncRoute(controller.list));
  return router;
}
