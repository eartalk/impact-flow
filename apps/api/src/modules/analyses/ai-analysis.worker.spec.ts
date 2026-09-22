import { AiAnalysisWorker } from './ai-analysis.worker';

describe('AiAnalysisWorker', () => {
  function setup(outcome: 'SUCCESS' | 'ERROR', retryResult: 'RETRY' | 'FAILED' = 'RETRY') {
    const analyses = {
      claimNextAiForWorker: jest.fn(),
      retryOrFailAi: jest.fn().mockResolvedValue(retryResult),
    };
    const service = {
      processClaimedAi:
        outcome === 'SUCCESS'
          ? jest.fn().mockResolvedValue(undefined)
          : jest.fn().mockRejectedValue(new Error('temporary ai failure')),
    };
    const worker = new AiAnalysisWorker(analyses as never, service as never);
    return { analyses, service, worker };
  }

  it('does not reschedule a successful claimed task', async () => {
    const { analyses, service, worker } = setup('SUCCESS');
    await (worker as unknown as { execute(id: string, attempt: number): Promise<void> })
      .execute('task-1', 1);
    expect(service.processClaimedAi).toHaveBeenCalledWith('task-1', expect.any(String));
    expect(analyses.retryOrFailAi).not.toHaveBeenCalled();
  });

  it.each(['RETRY', 'FAILED'] as const)(
    'persists AI execution errors as %s',
    async (retryResult) => {
      const { analyses, worker } = setup('ERROR', retryResult);
      await (worker as unknown as { execute(id: string, attempt: number): Promise<void> })
        .execute('task-2', 2);
      expect(analyses.retryOrFailAi).toHaveBeenCalledWith(
        'task-2',
        expect.any(String),
        'temporary ai failure',
        expect.any(Date),
      );
    },
  );
});
