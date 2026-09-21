import { Injectable } from '@nestjs/common';
import {
  NotificationDeliveryError,
  type NotificationGateway,
  type PendingChangeNotification,
} from '../../core/ports/notification.gateway';

type DingTalkResponse = {
  errcode?: number;
  errmsg?: string;
};

@Injectable()
export class DingTalkNotificationAdapter implements NotificationGateway {
  async sendPendingChange(input: PendingChangeNotification) {
    const content =
      '[通知] 服务: ' +
      input.projectName +
      ' 分支: ' +
      input.branch +
      ' 待检测提交: ' +
      input.commits.length +
      '个';

    await this.send(input.webhook, {
      msgtype: 'text',
      text: { content },
    });
  }

  async test(webhook: string) {
    await this.send(webhook, {
      msgtype: 'text',
      text: {
        content: 'Impact Flow：钉钉待检测通知连接测试成功。',
      },
    });
  }

  private async send(webhook: string, body: object) {
    const url = this.validateWebhook(webhook);
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new NotificationDeliveryError(
        '钉钉 Webhook 请求失败：' + message,
        'NETWORK',
      );
    }
    const payload = (await response.json().catch(() => ({}))) as DingTalkResponse;
    if (!response.ok || payload.errcode !== 0) {
      const code =
        payload.errcode !== undefined && payload.errcode !== 0
          ? String(payload.errcode)
          : 'HTTP_' + response.status;
      throw new NotificationDeliveryError(
        '钉钉 Webhook 返回失败：' + (payload.errmsg || 'HTTP ' + response.status),
        code,
      );
    }
  }

  private validateWebhook(value: string) {
    let url: URL;
    try {
      url = new URL(value.trim());
    } catch {
      throw new NotificationDeliveryError('钉钉 Webhook 地址格式不正确', 'INVALID_WEBHOOK');
    }
    const allowedHosts = new Set(['oapi.dingtalk.com', 'api.dingtalk.com']);
    if (
      url.protocol !== 'https:' ||
      !allowedHosts.has(url.hostname.toLowerCase()) ||
      !url.pathname.includes('/robot/send')
    ) {
      throw new NotificationDeliveryError('仅支持钉钉机器人 HTTPS Webhook', 'INVALID_WEBHOOK');
    }
    return url.toString();
  }
}
