// src/kernel/permission/continue-broker.ts
//
// Stop-hook 续跑撮合:hook 阻塞等用户在 IM 回复,回复文本作为续跑指令;
// 超时返回 null(= 正常停止)。仿 ask-broker 的 requestId 模式。

import { randomUUID } from 'node:crypto';

export interface ContinueRequest {
  requestId: string;
  cwd: string;
  context: string;
  failed?: boolean;
}

export class ContinueBroker {
  private pending = new Map<string, { cwd: string; resolve: (r: string | null) => void }>();
  private handler?: (req: ContinueRequest) => void;

  onRequest(h: (req: ContinueRequest) => void): void {
    this.handler = h;
  }

  request(opts: { cwd: string; context: string; timeoutSec: number; failed?: boolean }): Promise<string | null> {
    // One continuation per session. A new turn supersedes any older card for
    // the same session, so its timer must not later overwrite the new state.
    this.cancel(opts.cwd);
    const requestId = randomUUID();
    return new Promise<string | null>((resolve) => {
      this.pending.set(requestId, { cwd: opts.cwd, resolve });
      this.handler?.({ requestId, cwd: opts.cwd, context: opts.context, ...(opts.failed ? { failed: true } : {}) });
      setTimeout(() => {
        const entry = this.pending.get(requestId);
        if (entry) { this.pending.delete(requestId); entry.resolve(null); }
      }, opts.timeoutSec * 1000).unref();
    });
  }

  /** Returns true when the requestId was found in pending (live request answered),
   *  false when stale (timed out or already answered). */
  answer(requestId: string, reply: string): boolean {
    const entry = this.pending.get(requestId);
    if (!entry) return false;
    this.pending.delete(requestId);
    entry.resolve(reply);
    return true;
  }

  /** Cancel every stale continuation for one session (a new local turn won). */
  cancel(cwd: string): boolean {
    let cancelled = false;
    for (const [id, entry] of this.pending) {
      if (entry.cwd !== cwd) continue;
      this.pending.delete(id);
      entry.resolve(null);
      cancelled = true;
    }
    return cancelled;
  }

  hasPending(cwd: string): boolean {
    for (const entry of this.pending.values()) if (entry.cwd === cwd) return true;
    return false;
  }

  /** Graceful shutdown: resolve every held request as null (= normal stop) so
   *  the caller gets a clean reply and resolves, instead of its connection being
   *  destroyed and rejecting. Call before ipc.close() and let replies flush. */
  settleAllPending(): void {
    for (const [id, entry] of this.pending) {
      this.pending.delete(id);
      entry.resolve(null);
    }
  }
}
