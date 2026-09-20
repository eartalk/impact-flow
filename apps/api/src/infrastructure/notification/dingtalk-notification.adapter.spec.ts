import { DingTalkNotificationAdapter } from './dingtalk-notification.adapter';

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
          '[通知] 服务: 订单服务 分支: production 待检测提交: 1个',
      },
    });
  });
});
