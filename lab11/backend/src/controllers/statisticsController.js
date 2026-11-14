import { dateRange } from '../utils/validation.js';

export function createStatisticsController(pool) {
  return {
    summary: async (req, res) => {
      const range = dateRange(req.query);
      const values = [req.user.id, range.from, range.to];
      const catFilter = req.query.categoryId ? (values.push(req.query.categoryId), ` AND e.category_id=$${values.length}`) : '';
      const totals = await pool.query(
        `SELECT COALESCE(SUM(e.amount),0)::text AS total,COUNT(*)::int AS count FROM expenses e WHERE e.user_id=$1 AND e.expense_date BETWEEN $2::date AND $3::date${catFilter}`,
        values,
      );
      const byCategory = await pool.query(
        `SELECT c.id AS "categoryId",c.name AS category,c.color,c.icon,COALESCE(SUM(e.amount),0)::text AS amount,COUNT(e.id)::int AS count FROM categories c LEFT JOIN expenses e ON e.category_id=c.id AND e.user_id=$1 AND e.expense_date BETWEEN $2::date AND $3::date WHERE c.user_id=$1${req.query.categoryId ? ' AND c.id=$4' : ''} GROUP BY c.id ORDER BY SUM(e.amount) DESC NULLS LAST,c.name`,
        values,
      );
      const total = Number(totals.rows[0].total);
      const categories = byCategory.rows.map(row => ({
        ...row,
        share: total ? Number((Number(row.amount) / total * 100).toFixed(2)) : 0,
      }));
      const trend = await pool.query(
        `SELECT to_char(e.expense_date,'YYYY-MM-DD') AS date,SUM(e.amount)::text AS amount,COUNT(*)::int AS count FROM expenses e WHERE e.user_id=$1 AND e.expense_date BETWEEN $2::date AND $3::date${catFilter} GROUP BY e.expense_date ORDER BY e.expense_date`,
        values,
      );
      res.json({ period: range, total: totals.rows[0].total, count: totals.rows[0].count, categories, trend: trend.rows });
    },
  };
}
