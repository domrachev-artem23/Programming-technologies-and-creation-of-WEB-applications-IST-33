INSERT INTO users(name,email) VALUES('Артемий Домрачев','artemiy@example.test') ON CONFLICT(email) DO NOTHING;
INSERT INTO categories(user_id,name,color) SELECT u.id,v.name,v.color FROM users u CROSS JOIN (VALUES('Продукты','#14b887'),('Транспорт','#f5a623'),('Покупки','#a66cff'),('Развлечения','#ef647b'),('Здоровье','#42a5f5'),('Жильё','#73849a')) v(name,color) WHERE u.email='artemiy@example.test' ON CONFLICT DO NOTHING;
INSERT INTO expenses(user_id,category_id,amount,spent_on,description)
SELECT u.id,c.id,x.amount,x.dt::date,x.descr FROM users u CROSS JOIN (VALUES(1380,'2026-11-02','Покупка продуктов'),(420,'2026-11-04','Метро и автобус'),(899,'2026-11-06','Подписка на музыку'),(2350,'2026-11-08','Продукты на неделю'),(760,'2026-11-10','Аптека')) x(amount,dt,descr)
JOIN categories c ON c.user_id=u.id AND c.name=CASE x.descr WHEN 'Метро и автобус' THEN 'Транспорт' WHEN 'Подписка на музыку' THEN 'Развлечения' WHEN 'Аптека' THEN 'Здоровье' ELSE 'Продукты' END
WHERE u.email='artemiy@example.test' AND NOT EXISTS(SELECT 1 FROM expenses e WHERE e.user_id=u.id AND e.description=x.descr AND e.spent_on=x.dt::date);
