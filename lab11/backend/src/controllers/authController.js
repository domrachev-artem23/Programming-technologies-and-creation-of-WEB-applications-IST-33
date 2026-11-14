import bcrypt from 'bcryptjs';
import { tokenFor } from '../middleware/auth.js';
import { httpError } from '../utils/asyncRoute.js';
import { validEmail } from '../utils/validation.js';

const defaultCategories = [
  ['Продукты', '#2482ef', 'cart'], ['Транспорт', '#f6ad35', 'train'], ['Покупки', '#38bdad', 'bag'],
  ['Развлечения', '#9862e8', 'film'], ['Здоровье', '#eb78b7', 'health'], ['Жильё', '#ed5364', 'home2'],
  ['Другое', '#a6b4c8', 'other'],
];

export function createAuthController(pool, secret) {
  return {
    register: async (req, res) => {
      const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
      const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      const password = req.body.password;
      if (name.length < 2 || name.length > 100) throw httpError('Имя должно содержать от 2 до 100 символов');
      if (!validEmail(email)) throw httpError('Укажите корректную почту');
      if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
        throw httpError('Пароль должен содержать от 8 до 128 символов');
      }
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const created = await client.query(
          'INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id,name,email',
          [name, email, await bcrypt.hash(password, 12)],
        );
        const user = created.rows[0];
        for (const [category, color, icon] of defaultCategories) {
          await client.query('INSERT INTO categories(user_id,name,color,icon) VALUES($1,$2,$3,$4)', [user.id, category, color, icon]);
        }
        await client.query('COMMIT');
        res.status(201).json({ token: tokenFor(user, secret), user });
      } catch (error) {
        await client.query('ROLLBACK');
        if (error.code === '23505') throw httpError('Аккаунт с такой почтой уже существует', 409);
        throw error;
      } finally {
        client.release();
      }
    },
    login: async (req, res) => {
      const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      const password = req.body.password;
      const result = await pool.query('SELECT id,name,email,password_hash FROM users WHERE LOWER(email)=LOWER($1)', [email]);
      const user = result.rows[0];
      if (!user || typeof password !== 'string' || !(await bcrypt.compare(password, user.password_hash))) {
        throw httpError('Неверная почта или пароль', 401);
      }
      delete user.password_hash;
      res.json({ token: tokenFor(user, secret), user });
    },
    me: (req, res) => res.json({ user: req.user }),
  };
}
