import { Router } from 'express';
import { createStatisticsController } from '../controllers/statisticsController.js';
import { createAuth } from '../middleware/auth.js';
import { asyncRoute } from '../utils/asyncRoute.js';

export function createStatisticsRoutes(pool, jwtSecret) {
  const router = Router();
  const controller = createStatisticsController(pool);
  router.use(createAuth(pool, jwtSecret));
  router.get('/summary', asyncRoute(controller.summary));
  return router;
}
