export interface ThoughtData {
  thought: string;
  thoughtNumber: number;
  totalThoughts: number;
  nextThoughtNeeded: boolean;
}

export interface StoredThought extends ThoughtData {
  timestamp: number;
}

export interface ContextSummary {
  recentThoughts: readonly {
    number: number;
    preview: string;
  }[];
}

export type ProcessResult =
  | {
      ok: true;
      result: {
        thoughtNumber: number;
        totalThoughts: number;
        progress: number;
        nextThoughtNeeded: boolean;
        thoughtHistoryLength: number;
        context: ContextSummary;
      };
      error?: never;
    }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
      };
      result?: never;
    };
