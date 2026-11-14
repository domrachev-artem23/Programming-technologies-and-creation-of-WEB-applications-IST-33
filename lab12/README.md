# Работа 12 — FinBuddy API, вариант 9

Flask REST API и PostgreSQL для личных расходов: аккаунты и JWT, категории, CRUD расходов, поиск и фильтры, суммы и статистика за период.

## Запуск на этом компьютере
PostgreSQL и пароль базы уже настроены. Дважды нажмите run-lab12.bat — он подготовит окружение, создаст отдельную базу finbuddy_lab12 и откроет API. Адрес проверки: http://127.0.0.1:5000/api/health.

При переносе на другой компьютер проверьте DB_PASSWORD в .env.

Демо-вход: artemiy@example.test / finbuddy123.

## Маршруты
POST /api/auth/register, POST /api/auth/login; GET/POST /api/categories; GET/POST /api/expenses; PUT/DELETE /api/expenses/<id>; поиск и фильтр: /api/expenses?search=еда&category_id=1&period=week; произвольный период: start и end; сводка: /api/statistics/total?period=month; категории: /api/statistics/categories; динамика: /api/statistics/dynamics?days=30.
