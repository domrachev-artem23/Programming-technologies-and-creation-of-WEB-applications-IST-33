# FinBuddy REST API — работа 11, вариант 9

Backend-проект без frontend: Node.js 20+, Express 5 и PostgreSQL.

## Запуск

1. Создайте пустую базу данных finbuddy в PostgreSQL.
2. Скопируйте .env.example в .env; укажите свои данные подключения и случайный JWT_SECRET длиной от 32 символов. Не передавайте .env.
3. В каталоге backend выполните:

   npm install
   npm run db:init
   npm start

API будет доступен по адресу http://localhost:3000. Проверка сервера и базы: GET /api/health.

## Маршруты

| Метод | Путь | Что делает |
|---|---|---|
| POST | /api/auth/register | Регистрирует пользователя и создаёт его стандартные категории |
| POST | /api/auth/login | Выпускает JWT |
| GET | /api/auth/me | Возвращает текущий профиль |
| GET | /api/categories | Список категорий текущего пользователя |
| GET | /api/expenses | Список расходов с фильтрами и поиском, новые сначала |
| POST | /api/expenses | Добавляет расход |
| GET | /api/expenses/:id | Получает расход |
| PUT | /api/expenses/:id | Полностью изменяет расход |
| DELETE | /api/expenses/:id | Удаляет расход |
| GET | /api/statistics/summary | Сумма, категории с долями, ежедневная динамика |

Маршруты расходов, категорий и статистики требуют заголовок Authorization: Bearer token. Для расходов доступны search, categoryId, from, to и period=day|week|month|custom; коротким периодам задаётся date=YYYY-MM-DD, произвольному — обе границы from и to.

Схема таблиц и индексов находится в schema.sql. Каждая запись привязана к владельцу; пароль пользователя хранится в виде хеша.
