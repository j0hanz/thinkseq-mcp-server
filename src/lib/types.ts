export interface ThoughtData {
  thought: string;
  totalThoughts: number;
  revisesThought?: number;
}

export interface StoredThought extends ThoughtData {
  thoughtNumber: number;
  timestamp: number;
  revisionOf?: number;
  supersededBy?: number;
  isActive: boolean;
}

export interface RevisionInfo {
  revises: number;
  supersedes: number[];
}

export interface ContextSummary {
  recentThoughts: readonly {
    number: number;
    preview: string;
  }[];
  revisionInfo?: RevisionInfo;
}

export type ProcessResult =
  | {
      ok: true;
      result: {
        thoughtNumber: number;
        totalThoughts: number;
        progress: number;
        isComplete: boolean;
        thoughtHistoryLength: number;
        hasRevisions: boolean;
        activePathLength: number;
        revisableThoughts: number[];
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
