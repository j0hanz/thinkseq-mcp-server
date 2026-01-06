export type ThoughtType =
  | 'analysis'
  | 'hypothesis'
  | 'verification'
  | 'revision'
  | 'conclusion';

export interface ThoughtData {
  thought: string;
  thoughtNumber: number;
  totalThoughts: number;
  nextThoughtNeeded: boolean;
  isRevision?: boolean;
  revisesThought?: number;
  branchFromThought?: number;
  branchId?: string;
  thoughtType?: ThoughtType;
}

export interface StoredThought extends ThoughtData {
  timestamp: number;
}

export interface ContextSummary {
  recentThoughts: {
    number: number;
    preview: string;
    type?: ThoughtType;
  }[];
  currentBranch?: string;
  hasRevisions: boolean;
}

export type ProcessResult =
  | {
      ok: true;
      result: {
        thoughtNumber: number;
        totalThoughts: number;
        nextThoughtNeeded: boolean;
        thoughtHistoryLength: number;
        branches: string[];
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
