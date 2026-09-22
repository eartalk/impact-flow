import { mysqlDateTimeToIso } from './mysql-datetime';

describe('mysqlDateTimeToIso', () => {
  it('interprets timezone-less MySQL DATETIME values as Asia/Shanghai', () => {
    expect(mysqlDateTimeToIso('2026-09-21 17:59:18.489')).toBe(
      '2026-09-21T09:59:18.489Z',
    );
  });

  it('preserves timestamps that already contain an offset', () => {
    expect(mysqlDateTimeToIso('2026-09-21T09:59:18.489Z')).toBe(
      '2026-09-21T09:59:18.489Z',
    );
  });
});
