import { TextEncoder, TextDecoder } from 'util';
import { parseSSELine, CompanionService } from './companion.service';

if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = TextEncoder;
}
if (typeof global.TextDecoder === 'undefined') {
  global.TextDecoder = TextDecoder as any;
}

describe('SSE Token Parsing and Whitespace Preservation', () => {
  test('parses simple token without leading space', () => {
    const result = parseSSELine('data: hello');
    expect(result).toEqual({ type: 'token', content: 'hello' });
  });

  test('preserves single leading space in token payload', () => {
    // LLM tokens often start with a space (e.g. " world")
    // SSE payload line has two spaces after "data:": first is protocol separator, second is token content
    const result = parseSSELine('data:  world');
    expect(result).toEqual({ type: 'token', content: ' world' });
  });

  test('preserves multiple leading spaces for code indentation', () => {
    const result = parseSSELine('data:    def foo():');
    expect(result).toEqual({ type: 'token', content: '   def foo():' });
  });

  test('handles empty data line', () => {
    const result = parseSSELine('data: ');
    expect(result).toEqual({ type: 'token', content: '' });
  });

  test('handles data: without space', () => {
    const result = parseSSELine('data:');
    expect(result).toEqual({ type: 'token', content: '' });
  });

  test('ignores blank lines and SSE comments', () => {
    expect(parseSSELine('')).toEqual({ type: 'ignore' });
    expect(parseSSELine('\r')).toEqual({ type: 'ignore' });
    expect(parseSSELine(': ping keepalive')).toEqual({ type: 'ignore' });
    expect(parseSSELine('event: message')).toEqual({ type: 'ignore' });
  });

  test('detects [DONE] termination signal', () => {
    const result = parseSSELine('data: [DONE]');
    expect(result).toEqual({ type: 'done' });
  });

  test('detects Error: message payload', () => {
    const result = parseSSELine('data: Error: LLM rate limit exceeded');
    expect(result).toEqual({ type: 'error', content: 'LLM rate limit exceeded' });
  });

  test('handles trailing carriage return \\r gracefully', () => {
    const result = parseSSELine('data:  token_with_crlf\r');
    expect(result).toEqual({ type: 'token', content: ' token_with_crlf' });
  });

  test('parses structured JSON events', () => {
    const deltaResult = parseSSELine('data: {"type": "assistant_delta", "delta": "Hello"}');
    expect(deltaResult).toEqual({
      type: 'event',
      event: { type: 'assistant_delta', delta: 'Hello' },
    });

    const approvalResult = parseSSELine('data: {"type": "approval_required", "pending_action_id": "pca_123"}');
    expect(approvalResult).toEqual({
      type: 'event',
      event: { type: 'approval_required', pending_action_id: 'pca_123' },
    });
  });

  test('ignores untyped internal action and tool payloads to prevent assistant prose leakage', () => {
    // Naked action envelope
    const actionPayload = parseSSELine('data: {"action": "email", "parameters": {"to": "test@example.com"}}');
    expect(actionPayload).toEqual({ type: 'ignore' });

    // Known capability action
    const capAction = parseSSELine('data: {"action": "calendar"}');
    expect(capAction).toEqual({ type: 'ignore' });

    // Tool call envelope
    const toolPayload = parseSSELine('data: {"tool": "whatsapp", "arguments": {"message": "hi"}}');
    expect(toolPayload).toEqual({ type: 'ignore' });

    // Function call envelope
    const funcPayload = parseSSELine('data: {"function": {"name": "reminder", "parameters": {}}}');
    expect(funcPayload).toEqual({ type: 'ignore' });

    // Action type payload
    const typeAction = parseSSELine('data: {"type": "action", "name": "email"}');
    expect(typeAction).toEqual({ type: 'ignore' });
  });

  test('preserves legitimate user-requested JSON and fenced markdown blocks', () => {
    // Normal JSON (e.g. user requested a profile object)
    const userJson = parseSSELine('data: {"name": "Alice", "age": 30, "city": "Bengaluru"}');
    expect(userJson).toEqual({
      type: 'token',
      content: '{"name": "Alice", "age": 30, "city": "Bengaluru"}',
    });

    // Fenced code block opening
    const codeFence = parseSSELine('data: ```json');
    expect(codeFence).toEqual({
      type: 'token',
      content: '```json',
    });

    // Ordinary text token
    const textToken = parseSSELine('data: Here is the answer you requested:');
    expect(textToken).toEqual({
      type: 'token',
      content: 'Here is the answer you requested:',
    });
  });
});

describe('CompanionService.chatStream termination and reader cleanup', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function createMockReader(chunks: string[]) {
    let index = 0;
    const encoder = new TextEncoder();
    const reader = {
      read: jest.fn().mockImplementation(async () => {
        if (index < chunks.length) {
          const chunk = chunks[index++];
          return { value: encoder.encode(chunk), done: false };
        }
        return { value: undefined, done: true };
      }),
      cancel: jest.fn().mockResolvedValue(undefined),
      releaseLock: jest.fn(),
    };
    return reader;
  }

  test('1 & 2. A stream emitting message_complete but delaying or omitting [DONE] resolves promptly and preserves final content', async () => {
    const reader = createMockReader([
      'data: {"type": "assistant_delta", "delta": "Hello"}\n\n',
      'data: {"type": "message_complete", "message": "Hello world, finished!"}\n\n',
      'data: [DONE]\n\n',
    ]);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: { getReader: () => reader },
      json: async () => ({}),
    } as any);

    const onToken = jest.fn();
    const onEvent = jest.fn();

    const result = await CompanionService.chatStream('test_user', 'hi', onToken, undefined, 'web', onEvent);

    expect(result).toBe('Hello world, finished!');
    expect(onToken).toHaveBeenCalledWith('Hello');
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'message_complete', message: 'Hello world, finished!' })
    );
    // Reader should not have read past message_complete (did not read chunk 3)
    expect(reader.read).toHaveBeenCalledTimes(2);
  });

  test('3. The reader is cleaned up appropriately on early completion', async () => {
    const reader = createMockReader([
      'data: {"type": "message_complete", "message": "Complete"}\n\n',
    ]);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: { getReader: () => reader },
      json: async () => ({}),
    } as any);

    await CompanionService.chatStream('test_user', 'hi', jest.fn());

    expect(reader.cancel).toHaveBeenCalled();
    expect(reader.releaseLock).toHaveBeenCalled();
  });

  test('4. Completion is not applied twice when [DONE] follows message_complete', async () => {
    const reader = createMockReader([
      'data: {"type": "message_complete", "message": "Final payload"}\n\ndata: [DONE]\n\n',
    ]);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: { getReader: () => reader },
      json: async () => ({}),
    } as any);

    const onEvent = jest.fn();
    const result = await CompanionService.chatStream('test_user', 'hi', jest.fn(), undefined, 'web', onEvent);

    expect(result).toBe('Final payload');
    expect(onEvent).toHaveBeenCalledTimes(1);
  });

  test('5. Final buffered event is processed when EOF occurs without a trailing newline', async () => {
    const reader = createMockReader([
      'data: {"type": "message_complete", "message": "Payload at EOF without newline"}',
    ]);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: { getReader: () => reader },
      json: async () => ({}),
    } as any);

    const onEvent = jest.fn();
    const result = await CompanionService.chatStream('test_user', 'hi', jest.fn(), undefined, 'web', onEvent);

    expect(result).toBe('Payload at EOF without newline');
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'message_complete', message: 'Payload at EOF without newline' })
    );
  });
});
