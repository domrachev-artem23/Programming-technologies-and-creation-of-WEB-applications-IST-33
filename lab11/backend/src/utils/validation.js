import { httpError } from './asyncRoute.js';

export const validEmail = value => typeof value === 'string'
  && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  && value.length <= 255;

export const validDate = value => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export function dateRange(query) {
  if (query.date && !validDate(query.date)) throw httpError('Дата должна быть в формате YYYY-MM-DD');
  const period = query.period;
  if (period && !['day', 'week', 'month', 'custom'].includes(period)) {
    throw httpError('Период должен быть day, week, month или custom');
  }
  if (period === 'custom' && (!query.from || !query.to)) {
    throw httpError('Для произвольного периода укажите from и to');
  }

  const anchor = query.date ? new Date(`${query.date}T00:00:00Z`) : new Date();
  if (period === 'day') {
    const date = anchor.toISOString().slice(0, 10);
    return { from: date, to: date };
  }
  if (period === 'week') {
    const fromDate = new Date(anchor);
    fromDate.setUTCDate(fromDate.getUTCDate() - ((fromDate.getUTCDay() + 6) % 7));
    const toDate = new Date(fromDate);
    toDate.setUTCDate(toDate.getUTCDate() + 6);
    return { from: fromDate.toISOString().slice(0, 10), to: toDate.toISOString().slice(0, 10) };
  }
  if (period === 'month') {
    return {
      from: `${anchor.getUTCFullYear()}-${String(anchor.getUTCMonth() + 1).padStart(2, '0')}-01`,
      to: new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0)).toISOString().slice(0, 10),
    };
  }

  if (query.from || query.to) {
    if ((query.from && !validDate(query.from)) || (query.to && !validDate(query.to))) {
      throw httpError('Даты должны быть в формате YYYY-MM-DD');
    }
    const from = query.from || '0001-01-01';
    const to = query.to || '9999-12-31';
    if (from > to) throw httpError('Дата начала периода позже даты окончания');
    return { from, to };
  }
  return { from: '0001-01-01', to: '9999-12-31' };
}

export function expenseInput(body = {}) {
  const amount = Number(body.amount);
  const categoryId = body.categoryId;
  const date = body.date;
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  if (!Number.isFinite(amount) || amount <= 0 || amount > 9999999999.99) throw httpError('Сумма должна быть больше нуля');
  if (typeof categoryId !== 'string' || !/^[0-9a-f-]{36}$/i.test(categoryId)) throw httpError('Укажите категорию');
  if (!validDate(date)) throw httpError('Укажите корректную дату в формате YYYY-MM-DD');
  if (description.length > 500) throw httpError('Описание не должно превышать 500 символов');
  return { amount: amount.toFixed(2), categoryId, date, description };
}
