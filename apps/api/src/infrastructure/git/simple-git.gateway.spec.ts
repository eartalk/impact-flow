import { ConfigService } from '@nestjs/config';
import type { ChangeEvidence, ChangedFile } from '@impact-flow/contracts';
import { SimpleGitGateway } from './simple-git.gateway';

describe('SimpleGitGateway change evidence', () => {
  it('extracts bounded diff hunks and redacts sensitive assignments', () => {
    const gateway = new SimpleGitGateway(new ConfigService({}));
    const files: ChangedFile[] = [{
      path: 'src/auth.service.ts',
      oldPath: null,
      changeType: 'M',
      additions: 2,
      deletions: 1,
    }];
    const patch = [
      'diff --git a/src/auth.service.ts b/src/auth.service.ts',
      '--- a/src/auth.service.ts',
      '+++ b/src/auth.service.ts',
      '@@ -1,2 +1,3 @@',
      '-const timeout = 10;',
      '+const timeout = 20;',
      '+const apiKey = super-secret;',
    ].join('\n');

    const result = parseEvidence(gateway, patch, files);

    expect(result).toEqual([expect.objectContaining({
      filePath: 'src/auth.service.ts',
      truncated: false,
    })]);
    expect(result[0]?.patch).toContain('const timeout = 20');
    expect(result[0]?.patch).toContain('apiKey = [REDACTED]');
    expect(result[0]?.patch).not.toContain('super-secret');
  });

  it('does not collect environment files or generated artifacts', () => {
    const gateway = new SimpleGitGateway(new ConfigService({}));
    const files: ChangedFile[] = [{
      path: '.env',
      oldPath: null,
      changeType: 'M',
      additions: 1,
      deletions: 1,
    }];
    const patch = [
      'diff --git a/.env b/.env',
      '--- a/.env',
      '+++ b/.env',
      '@@ -1 +1 @@',
      '-PASSWORD=old',
      '+PASSWORD=new',
    ].join('\n');

    expect(parseEvidence(gateway, patch, files)).toEqual([]);
  });
});

function parseEvidence(
  gateway: SimpleGitGateway,
  patch: string,
  files: ChangedFile[],
) {
  return (gateway as unknown as {
    parseChangeEvidence(output: string, changedFiles: ChangedFile[]): ChangeEvidence[];
  }).parseChangeEvidence(patch, files);
}
