import { spawn } from 'node:child_process';
import { isAmpThreadId } from './amp-transport.js';
import { isAcpSessionId } from './thread-mapping-store.js';

export interface AmpAccountThread {
  id: string;
  title?: string;
  updated?: string;
  tree?: string;
}

const AMP_THREAD_LIST_PAGE_SIZE = 100;
const AMP_THREAD_LIST_MAX = 2000;
const SYNTHETIC_SESSION_SUFFIX = 'ampacp';

export function listAmpThreadsEnabled(): boolean {
  const value = process.env.AMP_ACP_LIST_AMP_THREADS?.trim().toLowerCase();
  return value !== '0' && value !== 'false' && value !== 'off';
}

/** Stable ACP session ID for an Amp thread that has no local mapping yet. */
export function sessionIdForAmpThread(threadId: string): string {
  if (!isAmpThreadId(threadId)) {
    throw new Error(`Invalid Amp thread ID: ${threadId}`);
  }
  const compact = `t${threadId.slice('T-'.length).replace(/-/g, '').toLowerCase()}`;
  return `S-${compact}-${SYNTHETIC_SESSION_SUFFIX}`;
}

/** Inverse of sessionIdForAmpThread; null when the ID was not synthesized. */
export function ampThreadIdFromSessionId(sessionId: string): string | null {
  if (!isAcpSessionId(sessionId)) return null;
  const match = /^S-t([0-9a-f]{32})-ampacp$/i.exec(sessionId);
  if (!match) return null;
  const hex = match[1]!.toLowerCase();
  const threadId = `T-${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return isAmpThreadId(threadId) ? threadId : null;
}

export function cwdFromThreadTree(tree: string | undefined): string | undefined {
  if (!tree) return undefined;
  try {
    const url = new URL(tree);
    if (url.protocol !== 'file:') return undefined;
    let pathname = decodeURIComponent(url.pathname);
    if (/^\/[a-zA-Z]:\//.test(pathname)) pathname = pathname.slice(1);
    return pathname || undefined;
  } catch {
    return undefined;
  }
}

function parseAmpThread(value: unknown): AmpAccountThread | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (!isAmpThreadId(record.id)) return null;
  const thread: AmpAccountThread = { id: record.id };
  if (typeof record.title === 'string' && record.title.trim()) thread.title = record.title;
  if (typeof record.updated === 'string' && record.updated.trim()) thread.updated = record.updated;
  if (typeof record.tree === 'string' && record.tree.trim()) thread.tree = record.tree;
  return thread;
}

function runAmpThreadsList(offset: number, limit: number): Promise<unknown> {
  const command = process.env.AMP_CLI_PATH ?? 'amp';
  return new Promise((resolve, reject) => {
    const child = spawn(command, [
      'threads',
      'list',
      '--json',
      '--limit',
      String(limit),
      '--offset',
      String(offset),
    ], {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.once('error', reject);
    child.once('close', (code) => {
      if (code !== 0) {
        const details = Buffer.concat(stderr).toString().trim();
        reject(new Error(`amp threads list exited with code ${code}${details ? `: ${details}` : ''}`));
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(stdout).toString() || '[]'));
      } catch (error) {
        reject(new Error(`failed to parse amp threads list output: ${error}`));
      }
    });
  });
}

/**
 * List Amp account threads through the CLI. Failures return an empty list so
 * session/list still serves locally persisted ACP sessions.
 */
export async function listAmpAccountThreads(): Promise<AmpAccountThread[]> {
  const threads: AmpAccountThread[] = [];
  let offset = 0;
  while (offset < AMP_THREAD_LIST_MAX) {
    let page: unknown;
    try {
      page = await runAmpThreadsList(offset, AMP_THREAD_LIST_PAGE_SIZE);
    } catch (error) {
      console.error('[acp] failed to list Amp account threads', error);
      return threads;
    }
    if (!Array.isArray(page) || page.length === 0) break;
    for (const item of page) {
      const thread = parseAmpThread(item);
      if (thread) threads.push(thread);
    }
    if (page.length < AMP_THREAD_LIST_PAGE_SIZE) break;
    offset += page.length;
  }
  return threads;
}
