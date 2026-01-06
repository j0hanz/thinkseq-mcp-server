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
  isRevision?: boolean | undefined;
  revisesThought?: number | undefined;
  branchFromThought?: number | undefined;
  branchId?: string | undefined;
  thoughtType?: ThoughtType | undefined;
}

export interface StoredThought extends ThoughtData {
  timestamp: number;
}

export interface ContextSummary {
  recentThoughts: {
    number: number;
    preview: string;
    type?: ThoughtType | undefined;
  }[];
  currentBranch?: string | undefined;
  hasRevisions: boolean;
}

export interface ProcessResult extends Record<string, unknown> {
  ok: boolean;
  result?: {
    thoughtNumber: number;
    totalThoughts: number;
    nextThoughtNeeded: boolean;
    thoughtHistoryLength: number;
    branches: string[];
    context: ContextSummary;
  };
  error?: {
    code: string;
    message: string;
  };
}
