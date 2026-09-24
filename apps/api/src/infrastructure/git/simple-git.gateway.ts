import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join, resolve } from 'node:path';
import { mkdir, stat } from 'node:fs/promises';
import simpleGit from 'simple-git';
import type { GitGateway } from '../../core/ports/git.gateway';
import type {
  ChangeEvidence,
  ChangedFile,
  CommitSummary,
  FileChangeType,
} from '@impact-flow/contracts';

@Injectable()
export class SimpleGitGateway implements GitGateway {
  constructor(private readonly config: ConfigService) {}

  async testConnection(input: {
    repositoryUrl: string;
    productionBranch: string;
  }): Promise<{ remoteCommit: string }> {
    const output = await simpleGit().raw([
      'ls-remote',
      '--heads',
      input.repositoryUrl,
      `refs/heads/${input.productionBranch}`,
    ]);
    const remoteCommit = output.trim().split(/\s+/)[0];
    if (!remoteCommit) {
      throw new Error(`远程仓库中不存在分支 ${input.productionBranch}`);
    }
    return { remoteCommit };
  }

  async detectVersion(input: {
    projectId: string;
    repositoryUrl: string;
    productionBranch: string;
    lastAnalyzedCommit: string | null;
  }) {
    const git = await this.prepareRepository(input);

    const targetCommit = (
      await git.revparse([`origin/${input.productionBranch}`])
    ).trim();

    if (input.lastAnalyzedCommit) {
      return {
        baseCommit: input.lastAnalyzedCommit,
        targetCommit,
        baseSource: 'LAST_ANALYSIS' as const,
      };
    }

    const baseCommit = (await git.revparse([`${targetCommit}^1`])).trim();
    return {
      baseCommit,
      targetCommit,
      baseSource: 'FIRST_PARENT' as const,
    };
  }

  async analyzeRange(input: {
    projectId: string;
    repositoryUrl: string;
    productionBranch: string;
    baseCommit: string;
    targetCommit: string;
    onRepositoryReady?: () => Promise<void>;
  }) {
    const git = await this.prepareRepository(input);
    await input.onRepositoryReady?.();
    const [commitOutput, nameStatusOutput, numStatOutput, patchOutput] = await Promise.all([
      git.raw([
        'log',
        '--format=%H%x1f%h%x1f%an%x1f%aI%x1f%s',
        `${input.baseCommit}..${input.targetCommit}`,
      ]),
      git.raw([
        'diff',
        '--name-status',
        '-M',
        input.baseCommit,
        input.targetCommit,
      ]),
      git.raw([
        'diff',
        '--numstat',
        '-M',
        input.baseCommit,
        input.targetCommit,
      ]),
      git.raw([
        'diff',
        '--no-color',
        '--no-ext-diff',
        '--unified=3',
        '-M',
        input.baseCommit,
        input.targetCommit,
      ]),
    ]);

    const commits = this.parseCommits(commitOutput);
    const numbers = this.parseNumStat(numStatOutput);
    const files = this.parseNameStatus(nameStatusOutput, numbers);

    return {
      commits,
      files,
      changeEvidence: this.parseChangeEvidence(patchOutput, files),
      additions: files.reduce((sum, file) => sum + file.additions, 0),
      deletions: files.reduce((sum, file) => sum + file.deletions, 0),
    };
  }

  async listCommits(input: {
    projectId: string;
    repositoryUrl: string;
    productionBranch: string;
    baseCommit: string;
    targetCommit: string;
  }): Promise<CommitSummary[]> {
    if (input.baseCommit === input.targetCommit) return [];
    const git = simpleGit(this.repositoryPath(input.projectId));
    const output = await git.raw([
      'log',
      '--first-parent',
      '--merges',
      '--format=%H%x1f%h%x1f%an%x1f%aI%x1f%s',
      `${input.baseCommit}..${input.targetCommit}`,
    ]);
    return this.parseCommits(output);
  }

  private async prepareRepository(input: {
    projectId: string;
    repositoryUrl: string;
    productionBranch: string;
  }) {
    const repositoryPath = this.repositoryPath(input.projectId);
    const cacheRoot = resolve(repositoryPath, '..');
    await mkdir(cacheRoot, { recursive: true });

    if (!(await this.exists(repositoryPath))) {
      await simpleGit().clone(input.repositoryUrl, repositoryPath, [
        '--no-checkout',
      ]);
    }

    const git = simpleGit(repositoryPath);
    await git.fetch('origin', input.productionBranch, ['--prune']);
    return git;
  }

  private repositoryPath(projectId: string) {
    const configuredCache = this.config.get<string>('REPOSITORY_CACHE_DIR');
    const cacheRoot = configuredCache
      ? resolve(configuredCache)
      : resolve(__dirname, '../../../../../var/repositories');
    return join(cacheRoot, projectId);
  }

  private parseCommits(output: string): CommitSummary[] {
    return output
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const [sha, shortSha, author, committedAt, ...subject] =
          line.split('\x1f');
        return {
          sha,
          shortSha,
          author,
          committedAt,
          subject: subject.join('\x1f'),
        };
      });
  }

  private parseNameStatus(
    output: string,
    numbers: Map<string, { additions: number; deletions: number }>,
  ): ChangedFile[] {
    return output
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const [rawStatus, firstPath, secondPath] = line.split('\t');
        const changeType = rawStatus.charAt(0) as FileChangeType;
        const path = changeType === 'R' || changeType === 'C'
          ? secondPath
          : firstPath;
        const stats = numbers.get(path) ?? { additions: 0, deletions: 0 };
        return {
          path,
          oldPath:
            changeType === 'R' || changeType === 'C' ? firstPath : null,
          changeType,
          ...stats,
        };
      });
  }

  private parseNumStat(output: string) {
    const result = new Map<string, { additions: number; deletions: number }>();
    for (const line of output.split(/\r?\n/).filter(Boolean)) {
      const [rawAdditions, rawDeletions, ...pathParts] = line.split('\t');
      let path = pathParts.join('\t');
      const renameMatch = path.match(/^(.*)\{.* => (.*)\}(.*)$/);
      if (renameMatch) {
        path = `${renameMatch[1]}${renameMatch[2]}${renameMatch[3]}`;
      } else if (path.includes(' => ')) {
        path = path.split(' => ').at(-1) ?? path;
      }
      result.set(path, {
        additions: rawAdditions === '-' ? 0 : Number(rawAdditions),
        deletions: rawDeletions === '-' ? 0 : Number(rawDeletions),
      });
    }
    return result;
  }

  private parseChangeEvidence(
    output: string,
    files: ChangedFile[],
  ): ChangeEvidence[] {
    // 为分批 AI 分析保留更完整的证据池；超出预算的文件仍会以摘要覆盖。
    const maxFiles = 500;
    const maxFileCharacters = 5_000;
    const maxTotalCharacters = 1_000_000;
    const fileByPath = new Map(
      files.flatMap((file) => [
        [file.path, file] as const,
        ...(file.oldPath ? [[file.oldPath, file] as const] : []),
      ]),
    );
    const evidence: ChangeEvidence[] = [];
    let totalCharacters = 0;

    for (const section of output.split(/(?=^diff --git )/m)) {
      if (!section.startsWith('diff --git ') || evidence.length >= maxFiles) continue;
      const newPath = this.patchPath(section.match(/^\+\+\+\s+(.+)$/m)?.[1]);
      const oldPath = this.patchPath(section.match(/^---\s+(.+)$/m)?.[1]);
      const file = (newPath && fileByPath.get(newPath))
        || (oldPath && fileByPath.get(oldPath));
      if (!file || this.isSensitiveOrGenerated(file.path)) continue;
      if (/^Binary files /m.test(section)) continue;

      const lines = section
        .split(/\r?\n/)
        .filter((line) =>
          line.startsWith('@@')
          || (line.startsWith('+') && !line.startsWith('+++'))
          || (line.startsWith('-') && !line.startsWith('---'))
          || line.startsWith(' '),
        )
        .map((line) => this.redactSensitiveValue(line));
      if (!lines.some((line) => line.startsWith('@@'))) continue;

      const available = Math.min(
        maxFileCharacters,
        maxTotalCharacters - totalCharacters,
      );
      if (available <= 0) break;
      const fullPatch = lines.join('\n').trim();
      const patch = fullPatch.slice(0, available);
      evidence.push({
        filePath: file.path,
        oldPath: file.oldPath,
        changeType: file.changeType,
        patch,
        truncated: patch.length < fullPatch.length,
      });
      totalCharacters += patch.length;
    }
    return evidence;
  }

  private patchPath(raw: string | undefined) {
    if (!raw || raw === '/dev/null') return null;
    const normalized = raw.trim().replace(/^"|"$/g, '');
    return normalized.replace(/^[ab]\//, '');
  }

  private isSensitiveOrGenerated(path: string) {
    const normalized = path.toLowerCase().replace(/\\/g, '/');
    const name = normalized.split('/').at(-1) ?? normalized;
    return (
      /(^|\/)\.(env|git|idea|vscode)(\/|$)/.test(normalized)
      || /(^|\/)(dist|build|coverage|vendor|node_modules)(\/|$)/.test(normalized)
      || /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|7z|jar|class|dll|exe|pfx|p12|pem|key)$/i.test(name)
      || /(^|[-_.])(secret|credentials?)([-_.]|$)/i.test(name)
      || /(^|\.)lock$/.test(name)
      || ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock'].includes(name)
    );
  }

  private redactSensitiveValue(line: string) {
    return line.replace(
      /((?:api[_-]?key|secret|password|access[_-]?token|private[_-]?key)\s*[:=]\s*)([^\s,;]+)/gi,
      '$1[REDACTED]',
    );
  }

  private async exists(path: string) {
    try {
      await stat(path);
      return true;
    } catch {
      return false;
    }
  }
}
