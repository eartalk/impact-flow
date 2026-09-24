import type { ChangeUnit, RegressionSuggestion } from '@impact-flow/contracts';
import { RegressionPlanner } from './regression-planner';

const unit = (overrides: Partial<ChangeUnit> = {}): ChangeUnit => ({
  id: 'symbol:submit',
  symbolKey: 'submit',
  title: 'OrderService.submit',
  filePath: 'src/order.service.ts',
  startLine: 12,
  changeType: 'MODIFIED',
  changeKind: 'BEHAVIOR',
  summary: '方法实现发生变化',
  riskLevel: 'HIGH',
  evidence: ['src/order.service.ts:12'],
  ...overrides,
});

const suggestion = (overrides: Partial<RegressionSuggestion> = {}): RegressionSuggestion => ({
  title: '订单提交',
  scope: '提交接口经过本次修改的方法',
  priority: 'P0',
  targetType: 'API',
  boundaryType: 'HTTP',
  coverageStatus: 'CONFIRMED',
  technicalConfidence: 'HIGH',
  businessConfidence: 'HIGH',
  entryPoints: ['POST /orders'],
  sourceSymbolKeys: ['submit'],
  evidence: ['src/order.service.ts:12'],
  confidence: 'HIGH',
  ...overrides,
});

describe('RegressionPlanner', () => {
  it('turns technical evidence into a business causal chain and executable checks', () => {
    const plan = new RegressionPlanner().plan({
      summary: '订单提交逻辑发生变化',
      riskLevel: 'HIGH',
      changeUnits: [unit()],
      ruleSuggestions: [suggestion()],
    });

    expect(plan.version).toBe(4);
    expect(plan.targets[0]).toEqual(expect.objectContaining({
      title: '订单提交',
      priority: 'P1',
      causalChain: [
        '变更：业务处理逻辑',
        '传播：可能关联到POST /orders',
        '业务影响：订单提交的创建结果、初始状态及后续流程衔接可能发生变化',
      ],
    }));
    expect(plan.targets[0]?.reason).toContain('创建结果、初始状态及后续流程衔接');
    expect(plan.targets[0]?.verificationPoints).toEqual(expect.arrayContaining([
      '订单提交成功后主记录、初始状态及后续流程数据保持一致',
      '无效或重复请求被正确拒绝，不留下不完整业务数据',
    ]));
    expect(plan.targets[0]?.verificationPoints.join(' ')).not.toContain('主流程与关键异常分支');
    expect(plan.targets[0]?.automatedTestRecommendations).toEqual([
      expect.objectContaining({
        kind: 'API',
        title: '订单提交接口自动化回归',
        entryPoints: ['POST /orders'],
      }),
    ]);
  });

  it('does not promote ordinary query, create and revoke endpoints to P0 because the overall risk is critical', () => {
    const approvalUnit = unit({
      title: 'AcceptanceFlowService.handleApproveResult',
      filePath: 'src/acceptance-flow.service.ts',
      summary: '修改审批结果处理方法',
      changeKind: 'BEHAVIOR',
      riskLevel: 'CRITICAL',
    });
    const scopes = [
      suggestion({ title: '工期管理查询', businessScenario: '工期管理查询', entryPoints: ['POST /project-schedule/modified/list'] }),
      suggestion({ title: '工期管理创建', businessScenario: '工期管理创建', entryPoints: ['POST /project-schedule/modified/add'] }),
      suggestion({ title: '工期管理撤销', businessScenario: '工期管理撤销', entryPoints: ['POST /project-schedule/modified/revoke'] }),
    ];

    const plan = new RegressionPlanner().plan({
      summary: '审批与工期管理发生变化',
      riskLevel: 'CRITICAL',
      changeUnits: [approvalUnit],
      ruleSuggestions: scopes,
    });

    expect(plan.targets.map((target) => target.priority)).toEqual(['P1', 'P1', 'P1']);
    expect(plan.riskLevel).toBe('HIGH');
    expect(plan.targets.find((target) => target.title === '工期管理撤销')?.verificationPoints)
      .toContain('重复撤销或不允许撤销的状态被明确拒绝，不产生二次数据变更');
  });

  it('reserves P0 for high-confidence critical business invariants', () => {
    const plan = new RegressionPlanner().plan({
      summary: '审批状态回写发生变化',
      riskLevel: 'CRITICAL',
      changeUnits: [unit({ changeKind: 'DATA', riskLevel: 'CRITICAL', summary: '审批结果状态回写发生变化' })],
      ruleSuggestions: [suggestion({
        title: '审批结果状态回写',
        businessScenario: '审批结果状态回写',
        entryPoints: ['ApprovalCallback.handleApproveResult'],
      })],
    });

    expect(plan.targets[0]?.priority).toBe('P0');
    expect(plan.targets[0]?.verificationPoints).toEqual(expect.arrayContaining([
      '审批结果状态回写通过与拒绝后，业务状态、审批记录和回写数据保持一致',
      '重复处理同一审批结果时保持幂等，不重复更新或生成记录',
      '成功路径完整落库；失败路径回滚，不产生孤立或脏数据',
    ]));
    expect(plan.riskLevel).toBe('HIGH');
  });

  it('merges AI and static candidates for the same entry without losing evidence', () => {
    const plan = new RegressionPlanner().plan({
      summary: '订单提交变化',
      riskLevel: 'HIGH',
      changeUnits: [unit()],
      ruleSuggestions: [suggestion({ evidence: ['static-chain'], scenarios: ['静态场景'] })],
      aiAnalysis: {
        status: 'SUCCESS', summary: 'AI 业务摘要', riskLevel: 'HIGH', keyFindings: [],
        regressionSuggestions: [suggestion({
          scope: '订单创建逻辑变化可能影响初始状态',
          evidence: ['ai-diff'], expectedResults: ['订单状态为待处理'],
        })],
        model: 'test-model', analyzedAt: new Date().toISOString(), errorMessage: null,
      },
    });

    expect(plan.targets).toHaveLength(1);
    expect(plan.targets[0]?.evidence).toEqual(expect.arrayContaining(['static-chain', 'ai-diff']));
    expect(plan.targets[0]?.verificationPoints).toEqual(expect.arrayContaining(['静态场景', '订单状态为待处理']));
    expect(plan.generatedBy).toBe('STATIC_AND_AI');
  });

  it('downgrades uncertain technical guesses and exposes untraced changes', () => {
    const config = unit({
      id: 'file:config', symbolKey: undefined, title: 'payment.yml', filePath: 'config/payment.yml',
      changeKind: 'CONFIG', summary: '配置变化', riskLevel: 'MEDIUM', evidence: ['config/payment.yml'],
    });
    const plan = new RegressionPlanner().plan({
      summary: '配置变化', riskLevel: 'MEDIUM', changeUnits: [config],
      ruleSuggestions: [suggestion({
        title: '支付配置', targetType: 'CONFIG', boundaryType: 'TECHNICAL',
        coverageStatus: 'NEEDS_REVIEW', confidence: 'LOW', businessConfidence: 'LOW',
        sourceSymbolKeys: [], entryPoints: ['config/payment.yml'], evidence: ['config/payment.yml'],
      })],
    });

    expect(plan.targets[0]?.priority).toBe('P2');
    expect(plan.unknowns).toEqual(expect.arrayContaining([
      expect.stringContaining('证据不足'),
      expect.stringContaining('尚未追踪到可靠业务边界'),
    ]));
    expect(plan.targets[0]?.automatedTestRecommendations).toEqual([]);
  });

  it('keeps deterministic technical validation priority without requiring business symbols', () => {
    const plan = new RegressionPlanner().plan({
      summary: '依赖变化', riskLevel: 'LOW', changeUnits: [],
      ruleSuggestions: [suggestion({
        title: '依赖安装与构建验证', priority: 'P1', targetType: 'CONFIG',
        boundaryType: 'TECHNICAL', coverageStatus: 'RECOMMENDED',
        confidence: 'HIGH', businessConfidence: 'HIGH', sourceSymbolKeys: [],
        entryPoints: ['pnpm-lock.yaml'], evidence: ['pnpm-lock.yaml：依赖变化'],
      })],
    });

    expect(plan.targets[0]?.priority).toBe('P1');
    expect(plan.unknowns).toEqual([]);
  });

  it('absorbs a related technical path into its business boundary instead of creating a duplicate card', () => {
    const plan = new RegressionPlanner().plan({
      summary: '工期管理查询发生变化',
      riskLevel: 'HIGH',
      changeUnits: [
        unit({ id: 'dao', symbolKey: 'dao-query', title: 'ProjectScheduleQueryDao' }),
        unit({ id: 'api', symbolKey: 'list-api', title: 'ScheduleController.list' }),
      ],
      ruleSuggestions: [
        suggestion({
          title: '工期管理查询', businessDomain: '工期管理', businessScenario: '工期管理查询',
          targetType: 'SYMBOL', boundaryType: 'TECHNICAL', coverageStatus: 'RECOMMENDED',
          businessConfidence: 'MEDIUM', sourceSymbolKeys: ['dao-query'],
          traceSymbolKeys: ['dao-query', 'schedule-service'],
          entryPoints: ['ProjectScheduleQueryDao', 'ProjectScheduleModifiedLogEntity.mediaList'],
          evidence: ['ProjectScheduleQueryDao → ProjectScheduleModifiedLogEntity.mediaList'],
        }),
        suggestion({
          title: '工期管理查询', businessDomain: '工期管理', businessScenario: '工期管理查询',
          entryPoints: ['POST /project-schedule/modified/list'], sourceSymbolKeys: ['list-api'],
          traceSymbolKeys: ['schedule-controller', 'schedule-service'],
          evidence: ['ScheduleController.list → ScheduleService.query'],
        }),
      ],
    });

    expect(plan.targets).toHaveLength(1);
    expect(plan.targets[0]).toEqual(expect.objectContaining({
      title: '工期管理查询',
      targetType: 'API',
      boundaryType: 'HTTP',
      entryPoints: ['POST /project-schedule/modified/list'],
      sourceSymbolKeys: expect.arrayContaining(['dao-query', 'list-api']),
      traceSymbolKeys: expect.arrayContaining(['schedule-service']),
    }));
    expect(plan.targets[0]?.evidence).toEqual(expect.arrayContaining([
      '内部调用：ProjectScheduleQueryDao',
      '内部调用：ProjectScheduleModifiedLogEntity.mediaList',
    ]));
    expect(plan.targets[0]?.automatedTestRecommendations).toHaveLength(1);
  });

  it('does not merge equal titles when their business scenario identity differs', () => {
    const plan = new RegressionPlanner().plan({
      summary: '多个项目的查询发生变化', riskLevel: 'MEDIUM', changeUnits: [],
      ruleSuggestions: [
        suggestion({
          title: '列表查询', businessDomain: '工期管理', businessScenario: '工期管理查询',
          entryPoints: ['POST /project-schedule/modified/list'],
        }),
        suggestion({
          title: '列表查询', businessDomain: '工地问题', businessScenario: '工地问题查询',
          entryPoints: ['POST /site-issues/list'],
        }),
      ],
    });

    expect(plan.targets).toHaveLength(2);
  });

  it('absorbs a same-scenario unmapped source file into the only confirmed business boundary', () => {
    const plan = new RegressionPlanner().plan({
      summary: '工期管理查询发生变化', riskLevel: 'HIGH', changeUnits: [],
      ruleSuggestions: [
        suggestion({
          title: '工期管理查询', businessDomain: '工期管理', businessScenario: '工期管理查询',
          targetType: 'SYMBOL', boundaryType: 'UNKNOWN', coverageStatus: 'NEEDS_REVIEW',
          businessConfidence: 'MEDIUM', confidence: 'LOW', sourceSymbolKeys: [],
          entryPoints: [
            'src/modules/bgw/project/service/project-schedule-query.service.ts',
            'src/modules/bgw/project/types/project-schedule-query.type.ts',
          ],
          evidence: ['两个源码文件未映射到 Symbol 边界'],
        }),
        suggestion({
          title: '工期管理查询', businessDomain: '工期管理', businessScenario: '工期管理查询',
          entryPoints: ['POST /project-schedule/modified/list'],
        }),
      ],
    });

    expect(plan.targets).toHaveLength(1);
    expect(plan.targets[0]).toEqual(expect.objectContaining({
      priority: 'P1',
      boundaryType: 'HTTP',
      coverageStatus: 'CONFIRMED',
      entryPoints: ['POST /project-schedule/modified/list'],
    }));
    expect(plan.targets[0]?.evidence).toEqual(expect.arrayContaining([
      expect.stringContaining('未映射文件：src/modules/bgw/project/service/project-schedule-query.service.ts'),
      expect.stringContaining('调用关系待确认'),
    ]));
  });

  it('keeps an unknown candidate separate when it is not a source-file fallback', () => {
    const plan = new RegressionPlanner().plan({
      summary: '工期管理查询发生变化', riskLevel: 'MEDIUM', changeUnits: [],
      ruleSuggestions: [
        suggestion({
          title: '工期管理查询', businessDomain: '工期管理', businessScenario: '工期管理查询',
          targetType: 'MODULE', boundaryType: 'UNKNOWN', coverageStatus: 'NEEDS_REVIEW',
          businessConfidence: 'MEDIUM', entryPoints: ['外部数据同步模块'],
        }),
        suggestion({
          title: '工期管理查询', businessDomain: '工期管理', businessScenario: '工期管理查询',
          entryPoints: ['POST /project-schedule/modified/list'],
        }),
      ],
    });

    expect(plan.targets).toHaveLength(2);
  });

  it('exposes failed AI batch files as explicit unknowns while preserving static results', () => {
    const plan = new RegressionPlanner().plan({
      summary: '订单提交变化', riskLevel: 'MEDIUM', changeUnits: [],
      ruleSuggestions: [suggestion()],
      aiAnalysis: {
        status: 'SUCCESS', summary: '部分批次完成', riskLevel: 'MEDIUM', keyFindings: [],
        regressionSuggestions: [], model: 'test-model', analyzedAt: new Date().toISOString(),
        errorMessage: '1 个批次失败',
        coverage: {
          strategy: 'BATCHED', complete: false, batchCount: 2, succeededBatches: 1, failedBatches: 1,
          totalFiles: 2, fullEvidenceFiles: 1, partialEvidenceFiles: 0, summaryOnlyFiles: 0, failedFiles: 1,
          totalSymbols: 0, analyzedSymbols: 0, totalImpacts: 0, analyzedImpacts: 0,
          files: [
            { filePath: 'src/order.controller.ts', status: 'FULL_EVIDENCE', batchIndexes: [1] },
            { filePath: 'src/order.service.ts', status: 'FAILED', batchIndexes: [2] },
          ],
          batches: [
            { index: 1, status: 'SUCCESS', fileCount: 1, symbolCount: 0, impactCount: 0 },
            { index: 2, status: 'FAILED', fileCount: 1, symbolCount: 0, impactCount: 0 },
          ],
        },
      },
    });

    expect(plan.targets).toHaveLength(1);
    expect(plan.unknowns).toContain('src/order.service.ts：AI 批次分析失败，当前结论仅由静态分析兜底');
    expect(plan.aiCoverage?.complete).toBe(false);
  });
});
