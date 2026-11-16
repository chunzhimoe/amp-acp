import { describe, expect, it } from 'bun:test';
import {
  ampThreadIdFromSessionId,
  cwdFromThreadTree,
  listAmpThreadsEnabled,
  sessionIdForAmpThread,
} from './amp-threads.js';

const threadId = 'T-01a1e353-9bec-76fb-9c6c-b483a71debd2';

describe('amp account thread listing helpers', () => {
  it('builds a stable ACP session ID that round-trips to the Amp thread', () => {
    const sessionId = sessionIdForAmpThread(threadId);
    expect(sessionId).toBe('S-t01a1e3539bec76fb9c6cb483a71debd2-ampacp');
    expect(ampThreadIdFromSessionId(sessionId)).toBe(threadId);
  });

  it('rejects ordinary ACP session IDs and invalid thread IDs', () => {
    expect(ampThreadIdFromSessionId('S-mwiyd85l-urkwo1')).toBeNull();
    expect(() => sessionIdForAmpThread('not-a-thread')).toThrow('Invalid Amp thread ID');
  });

  it('reads local paths from Amp thread tree URLs', () => {
    expect(cwdFromThreadTree('file:///Users/chunzhi/Documents')).toBe('/Users/chunzhi/Documents');
    expect(cwdFromThreadTree('file:///d%3A/CODE')).toBe('d:/CODE');
    expect(cwdFromThreadTree('https://example.com/not-a-path')).toBeUndefined();
  });

  it('treats listing as enabled unless explicitly disabled', () => {
    const previous = process.env.AMP_ACP_LIST_AMP_THREADS;
    try {
      delete process.env.AMP_ACP_LIST_AMP_THREADS;
      expect(listAmpThreadsEnabled()).toBe(true);
      process.env.AMP_ACP_LIST_AMP_THREADS = '1';
      expect(listAmpThreadsEnabled()).toBe(true);
      process.env.AMP_ACP_LIST_AMP_THREADS = '0';
      expect(listAmpThreadsEnabled()).toBe(false);
      process.env.AMP_ACP_LIST_AMP_THREADS = 'false';
      expect(listAmpThreadsEnabled()).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.AMP_ACP_LIST_AMP_THREADS;
      else process.env.AMP_ACP_LIST_AMP_THREADS = previous;
    }
  });
});
