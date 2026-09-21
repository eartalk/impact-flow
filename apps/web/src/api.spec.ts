import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  WorkspaceSwitchedError,
  api,
  bumpWorkspaceGeneration,
} from './api';

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('workspace request generation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('drops an old workspace response after the generation changes', async () => {
    const pending = deferredResponse();
    vi.stubGlobal('fetch', vi.fn(() => pending.promise));

    const request = api.listProjects();
    bumpWorkspaceGeneration();
    pending.resolve(jsonResponse([]));

    await expect(request).rejects.toBeInstanceOf(WorkspaceSwitchedError);
  });

  it('does not discard the workspace switch response itself', async () => {
    const pending = deferredResponse();
    vi.stubGlobal('fetch', vi.fn(() => pending.promise));
    const session = {
      user: {
        id: 'user-1',
        username: 'owner',
        displayName: 'Owner',
        status: 'ACTIVE' as const,
      },
      workspace: {
        id: 'workspace-2',
        name: '第二空间',
        code: 'workspace-2',
        role: 'OWNER' as const,
        status: 'ACTIVE' as const,
      },
    };

    const request = api.switchWorkspace('workspace-2');
    bumpWorkspaceGeneration();
    pending.resolve(jsonResponse(session));

    await expect(request).resolves.toEqual(session);
  });

  it('keeps the server error message for a failed request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ message: '无权访问该工作空间' }, 403)),
    );

    await expect(api.listWorkspaces()).rejects.toThrow('无权访问该工作空间');
  });
});
