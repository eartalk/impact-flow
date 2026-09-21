import { ConfigService } from '@nestjs/config';
import { ForbiddenException } from '@nestjs/common';
import { SameOriginGuard } from './same-origin.guard';

function context(method: string, headers: Record<string, string> = {}) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ method, headers }),
    }),
  } as never;
}

describe('SameOriginGuard', () => {
  const guard = new SameOriginGuard(
    new ConfigService({ WEB_ORIGIN: 'http://localhost:5173,https://impact.example.com' }),
  );

  it('allows safe methods regardless of origin', () => {
    expect(
      guard.canActivate(context('GET', { origin: 'https://evil.example' })),
    ).toBe(true);
  });

  it('allows configured origins and referers', () => {
    expect(
      guard.canActivate(context('POST', { origin: 'https://impact.example.com' })),
    ).toBe(true);
    expect(
      guard.canActivate(context('PATCH', { referer: 'http://localhost:5173/settings' })),
    ).toBe(true);
  });

  it('rejects cross-origin state changes', () => {
    expect(() =>
      guard.canActivate(context('POST', { origin: 'https://evil.example' })),
    ).toThrow(ForbiddenException);
  });

  it('allows non-browser clients without origin headers', () => {
    expect(guard.canActivate(context('POST'))).toBe(true);
  });
});
