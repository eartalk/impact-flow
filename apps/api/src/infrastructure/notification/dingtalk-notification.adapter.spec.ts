import { DingTalkNotificationAdapter } from './dingtalk-notification.adapter';
import { NotificationDeliveryError } from '../../core/ports/notification.gateway';

describe('DingTalkNotificationAdapter', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('sends pending changes as a single text line', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ errcode: 0, errmsg: 'ok' }),
    }) as unknown as typeof fetch;
    const adapter = new DingTalkNotificationAdapter();

    await adapter.sendPendingChange({
      webhook:
        'https://oapi.dingtalk.com/robot/send?access_token=test-token',
      projectName: '订单服务',
      projectCode: 'order-service',
      branch: 'production',
      baseCommit: '1234567890abcdef',
      targetCommit: 'abcdef1234567890',
      commits: [
        {
          sha: 'abcdef1234567890',
          shortSha: 'abcdef12',
          author: 'tester',
          subject: '新增接口',
          committedAt: new Date().toISOString(),
        },
      ],
    });

    const request = (global.fetch as jest.Mock).mock.calls[0][1];
    expect(JSON.parse(request.body)).toEqual({
      msgtype: 'text',
      text: {
        content:
          '[通知] 服务: 订单服务 分支: production 待检测合并: 1个',
      },
    });
  });

  it('surfaces the dingtalk errcode for delivery logging', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest
        .fn()
        .mockResolvedValue({ errcode: 300001, errmsg: 'invalid token' }),
    }) as unknown as typeof fetch;
    const adapter = new DingTalkNotificationAdapter();

    const error = await adapter
      .test('https://oapi.dingtalk.com/robot/send?access_token=test-token')
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(NotificationDeliveryError);
    expect((error as NotificationDeliveryError).code).toBe('300001');
    expect((error as NotificationDeliveryError).message).toContain('invalid token');
  });

  it('falls back to an HTTP status code when errcode is absent', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: jest.fn().mockResolvedValue({}),
    }) as unknown as typeof fetch;
    const adapter = new DingTalkNotificationAdapter();

    const error = await adapter
      .test('https://oapi.dingtalk.com/robot/send?access_token=test-token')
      .catch((thrown: unknown) => thrown);

    expect((error as NotificationDeliveryError).code).toBe('HTTP_503');
  });
});
