export function createCategoryController(pool) {
  return {
    list: async (req, res) => {
      const result = await pool.query('SELECT id,name,color,icon FROM categories WHERE user_id=$1 ORDER BY name', [req.user.id]);
      res.json({ categories: result.rows });
    },
  };
}
