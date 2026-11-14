export const asyncRoute = handler => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

export function httpError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}
