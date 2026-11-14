import { Router } from 'express';
import { createExpenseController } from '../controllers/expenseController.js';
import { createAuth } from '../middleware/auth.js';
import { asyncRoute } from '../utils/asyncRoute.js';

export function createExpenseRoutes(pool, jwtSecret) {
  const router = Router();
  const controller = createExpenseController(pool);
  router.use(createAuth(pool, jwtSecret));
  router.get('/', asyncRoute(controller.list));
  router.post('/', asyncRoute(controller.create));
  router.get('/:id', asyncRoute(controller.get));
  router.put('/:id', asyncRoute(controller.update));
  router.delete('/:id', asyncRoute(controller.remove));
  return router;
}
