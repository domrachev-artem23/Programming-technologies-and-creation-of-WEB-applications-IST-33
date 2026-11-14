import jwt from 'jsonwebtoken';
import { asyncRoute } from '../utils/asyncRoute.js';

export const tokenFor = (user, secret) => jwt.sign({ sub: user.id }, secret, {
  expiresIn: '12h',
  issuer: 'finbuddy-api',
});

export function createAuth(pool, secret) {
  return asyncRoute(async (req, res, next) => {
    const value = req.get('authorization') || '';
    if (!value.startsWith('Bearer ')) return res.status(401).json({ error: 'Требуется вход в аккаунт' });
    try {
      const payload = jwt.verify(value.slice(7), secret);
      const result = await pool.query('SELECT id, name, email FROM users WHERE id = $1', [payload.sub]);
      if (!result.rowCount) return res.status(401).json({ error: 'Пользователь не найден' });
      req.user = result.rows[0];
      next();
    } catch (error) {
      if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Сессия завершилась. Войдите снова.' });
      }
      next(error);
    }
  });
}
