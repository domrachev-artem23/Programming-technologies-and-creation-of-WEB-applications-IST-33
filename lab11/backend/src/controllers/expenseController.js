import { httpError } from '../utils/asyncRoute.js';
import { dateRange, expenseInput } from '../utils/validation.js';

const expenseSelect = `SELECT e.id, e.amount::text AS amount, to_char(e.expense_date, 'YYYY-MM-DD') AS date, e.description, e.category_id AS "categoryId", c.name AS category, c.color, c.icon, e.created_at AS "createdAt", e.updated_at AS "updatedAt" FROM expenses e JOIN categories c ON c.id = e.category_id`;

export function createExpenseController(pool) {
  async function ensureCategory(categoryId, userId) {
    const result = await pool.query('SELECT id FROM categories WHERE id=$1 AND user_id=$2', [categoryId, userId]);
    if (!result.rowCount) throw httpError('Категория не найдена');
  }

  return {
    list: async (req, res) => {
      const range = dateRange(req.query);
      const values = [req.user.id, range.from, range.to];
      let where = 'WHERE e.user_id=$1 AND e.expense_date BETWEEN $2::date AND $3::date';
      if (req.query.categoryId) { values.push(req.query.categoryId); where += ` AND e.category_id=$${values.length}`; }
      if (req.query.search) { values.push(`%${String(req.query.search).slice(0, 100)}%`); where += ` AND e.description ILIKE $${values.length}`; }
      const result = await pool.query(`${expenseSelect} ${where} ORDER BY e.expense_date DESC,e.created_at DESC`, values);
      res.json({ expenses: result.rows, period: range });
    },
    get: async (req, res) => {
      const result = await pool.query(`${expenseSelect} WHERE e.id=$1 AND e.user_id=$2`, [req.params.id, req.user.id]);
      if (!result.rowCount) throw httpError('Операция не найдена', 404);
      res.json({ expense: result.rows[0] });
    },
    create: async (req, res) => {
      const input = expenseInput(req.body);
      await ensureCategory(input.categoryId, req.user.id);
      const result = await pool.query(
        'INSERT INTO expenses(user_id,category_id,amount,expense_date,description) VALUES($1,$2,$3,$4,$5) RETURNING id',
        [req.user.id, input.categoryId, input.amount, input.date, input.description],
      );
      const created = await pool.query(`${expenseSelect} WHERE e.id=$1 AND e.user_id=$2`, [result.rows[0].id, req.user.id]);
      res.status(201).json({ expense: created.rows[0] });
    },
    update: async (req, res) => {
      const input = expenseInput(req.body);
      await ensureCategory(input.categoryId, req.user.id);
      const result = await pool.query(
        'UPDATE expenses SET category_id=$3,amount=$4,expense_date=$5,description=$6,updated_at=NOW() WHERE id=$1 AND user_id=$2 RETURNING id',
        [req.params.id, req.user.id, input.categoryId, input.amount, input.date, input.description],
      );
      if (!result.rowCount) throw httpError('Операция не найдена', 404);
      const updated = await pool.query(`${expenseSelect} WHERE e.id=$1 AND e.user_id=$2`, [req.params.id, req.user.id]);
      res.json({ expense: updated.rows[0] });
    },
    remove: async (req, res) => {
      const result = await pool.query('DELETE FROM expenses WHERE id=$1 AND user_id=$2 RETURNING id', [req.params.id, req.user.id]);
      if (!result.rowCount) throw httpError('Операция не найдена', 404);
      res.status(204).end();
    },
  };
}
