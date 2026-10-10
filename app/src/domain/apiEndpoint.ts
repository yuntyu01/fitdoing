/** A release without a configured backend must never send private records to a development host. */
export function resolveApiEndpoint(value: string | undefined, development: boolean): string {
  const configured = value?.trim().replace(/\/+$/, '') ?? '';
  if (!configured) return development ? 'http://10.0.2.2:8080' : '';
  try {
    const url = new URL(configured);
    if (url.username || url.password) return '';
    if (url.protocol !== 'https:' && !(development && url.protocol === 'http:')) return '';
    return configured;
  } catch {
    return '';
  }
}
