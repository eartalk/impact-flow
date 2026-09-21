import { AnalysisWorker } from './analysis.worker';

describe('AnalysisWorker', () => {
  function setup(outcome: 'SUCCESS' | 'ERROR', retryResult: 'RETRY' | 'FAILED' = 'RETRY') {
    const analyses = {
      claimNextForWorker: jest.fn(),
      retryOrFail: jest.fn().mockResolvedValue(retryResult),
    };
    const service = {
      recoverPendingAiTasks: jest.fn(),
      processClaimed:
        outcome === 'SUCCESS'
          ? jest.fn().mockResolvedValue(undefined)
          : jest.fn().mockRejectedValue(new Error('temporary git failure')),
    };
    const worker = new AnalysisWorker(analyses as never, service as never);
    return { analyses, service, worker };
  }

  it('does not reschedule a successful claimed task', async () => {
    const { analyses, service, worker } = setup('SUCCESS');
    await (worker as unknown as { execute(id: string, attempt: number): Promise<void> }).execute('task-1', 1);
    expect(service.processClaimed).toHaveBeenCalledWith('task-1', expect.any(String));
    expect(analyses.retryOrFail).not.toHaveBeenCalled();
  });

  it.each(['RETRY', 'FAILED'] as const)(
    'hands execution errors to the repository as %s',
    async (retryResult) => {
      const { analyses, worker } = setup('ERROR', retryResult);
      await (worker as unknown as { execute(id: string, attempt: number): Promise<void> }).execute('task-2', 2);
      expect(analyses.retryOrFail).toHaveBeenCalledWith(
        'task-2',
        expect.any(String),
        'temporary git failure',
        expect.any(Date),
      );
    },
  );
});
