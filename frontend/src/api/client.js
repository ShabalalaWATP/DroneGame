// Talking to the backend. Same origin only: the Vite proxy (or FastAPI itself) serves both.

const BASE = '/api/v1';
const OFFLINE = 'The save server is not running. You can keep playing, but nothing can be saved or loaded until it starts.';

export class ApiError extends Error {
  // retryable: the server could not be reached or failed; anything else means the request itself was refused
  constructor(message, retryable) {
    super(message);
    this.retryable = retryable;
  }
}

const REFUSED = { 404: 'That no longer exists.', 413: 'That is too large to save.', 422: 'The server refused that as invalid.' };

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(BASE + path, body === undefined ? { method } : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new ApiError(OFFLINE, true);
  }
  if (res.status >= 500) throw new ApiError(OFFLINE, true); // the dev proxy answers with a 5xx when the backend is down
  if (!res.ok) throw new ApiError(REFUSED[res.status] || `The server refused that (${res.status}).`, false);
  if (res.status === 204) return null;
  // the connection can still drop while the answer arrives, and then nobody knows whether the request worked
  try { return await res.json(); } catch { throw new ApiError(OFFLINE, true); }
}

const resource = (path) => ({
  list: () => request('GET', path),
  get: (id) => request('GET', `${path}/${id}`),
  create: (body) => request('POST', path, body),
  remove: (id) => request('DELETE', `${path}/${id}`),
});

export const createApi = () => ({
  laydowns: { ...resource('/laydowns'), replace: (id, body) => request('PUT', `/laydowns/${id}`, body) },
  figureSets: resource('/figure-sets'),
  packs: { list: () => request('GET', '/packs'), buildStatus: () => request('GET', '/packs/build'), build: (body) => request('POST', '/packs/build', body) },
  runs: { ...resource('/runs'), page: (limit, offset) => request('GET', `/runs?limit=${limit}&offset=${offset}`) },
});
