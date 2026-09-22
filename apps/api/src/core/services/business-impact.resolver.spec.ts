import { BusinessImpactResolver } from './business-impact.resolver';

describe('BusinessImpactResolver', () => {
  const resolver = new BusinessImpactResolver();

  it('turns a problem message service into a business scenario without claiming a boundary', () => {
    const result = resolver.resolve({
      key: 'problem-resolve-message',
      name: 'msgPush',
      qualifiedName: 'ProblemResolveMessageService.msgPush',
      kind: 'METHOD',
      filePath: 'src/problem/problem-resolve-message.service.ts',
      startLine: 10,
      endLine: 20,
    });

    expect(result).toEqual(expect.objectContaining({
      domain: '工地问题',
      scenario: '工地问题整改处理消息通知',
      boundaryType: 'TECHNICAL',
      confidence: 'MEDIUM',
    }));
  });

  it('uses a server route as a high-confidence business boundary', () => {
    const result = resolver.resolve({
      key: 'problem-create',
      name: 'create',
      qualifiedName: 'ProblemController.create',
      kind: 'METHOD',
      filePath: 'src/problem/problem.controller.ts',
      startLine: 10,
      endLine: 20,
      httpRoutes: [{ method: 'POST', path: '/problem/create', role: 'SERVER' }],
    });

    expect(result).toEqual(expect.objectContaining({
      domain: '工地问题',
      scenario: '工地问题创建',
      boundaryType: 'HTTP',
      confidence: 'HIGH',
      groupKey: 'problem:创建::HTTP',
    }));
  });
});
