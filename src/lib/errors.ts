export interface ErrorResponse extends Record<string, unknown> {
  content: { type: 'text'; text: string }[];
  structuredContent: {
    ok: false;
    error: { code: string; message: string };
    result?: unknown;
  };
  isError: true;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string' && error.length > 0) return error;
  return 'Unknown error';
}

export function createErrorResponse(
  code: string,
  message: string,
  result?: unknown
): ErrorResponse {
  const structured: ErrorResponse['structuredContent'] = {
    ok: false,
    error: { code, message },
    ...(result !== undefined && { result }),
  };
  const response: ErrorResponse = {
    content: [{ type: 'text', text: JSON.stringify(structured) }],
    structuredContent: structured,
    isError: true,
  };
  return response;
}
