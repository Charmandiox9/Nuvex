export class ApiError extends Error {
  constructor(public status: number, message: string, public suggestedName?: string, public code?: string) { super(message); }
}

export async function request<T>(path: string, method = 'GET', data?: unknown, signal?: AbortSignal): Promise<T> {
  const binary = data instanceof Blob;
  const response = await fetch(path, {
    method, signal, cache: 'no-store',
    headers: {
      'X-Nuvex-Request': '1',
      ...(data !== undefined ? { 'Content-Type': binary ? 'application/octet-stream' : 'application/json' } : {}),
    },
    body: data === undefined ? undefined : binary ? data : JSON.stringify(data),
  });
  const body = response.status === 204 ? undefined : await response.json().catch(() => undefined);
  if (!response.ok) throw new ApiError(response.status, body?.message ?? 'No se pudo conectar con Nuvex.', body?.suggestedName, body?.code);
  return body as T;
}

export const api = <T,>(path: string, method = 'GET', data?: unknown, signal?: AbortSignal) =>
  request<T>('/api/v1' + path, method, data, signal);

export async function gql<T>(query: string, variables: Record<string, string | number | undefined>) {
  const result = await request<{ data: T; errors?: { message: string; extensions?: { originalError?: { statusCode: number } } }[] }>(
    '/graphql', 'POST', { query, variables },
  );
  if (result.errors?.length) {
    const error = result.errors[0];
    throw new ApiError(error.extensions?.originalError?.statusCode ?? 400, error.message);
  }
  return result.data;
}

export const content = (id: string, mode = 'download') => '/api/v1/entries/' + id + '/content?mode=' + mode;
