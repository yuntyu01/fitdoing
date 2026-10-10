import { resolveApiEndpoint } from './apiEndpoint';

test('unconfigured release cannot contact the emulator host', () => {
  expect(resolveApiEndpoint(undefined, false)).toBe('');
  expect(resolveApiEndpoint('  ', false)).toBe('');
  expect(resolveApiEndpoint(undefined, true)).toBe('http://10.0.2.2:8080');
});

test('release accepts HTTPS but rejects plaintext, malformed and credential-bearing endpoints', () => {
  expect(resolveApiEndpoint(' https://example.com/api/ ', false)).toBe('https://example.com/api');
  for (const url of ['http://10.0.2.2:8080', 'https://user:password@example.com', 'not a URL', 'file:///tmp/api']) {
    expect(resolveApiEndpoint(url, false)).toBe('');
  }
});
