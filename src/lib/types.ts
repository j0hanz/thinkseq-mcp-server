export interface ThoughtData {
  thought: string;
  totalThoughts?: number;
  revisesThought?: number;
}

export interface StoredThought {
  thought: string;
  totalThoughts: number;
  revisesThought?: number;
  thoughtNumber: number;
  timestamp: number;
  revisionOf?: number;
  supersededBy?: number;
  isActive: boolean;
}

export interface RevisionInfo {
  revises: number;
  supersedes: number[];
  supersedesTotal: number;
}

export interface ContextSummary {
  recentThoughts: readonly {
    stepIndex: number;
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
        revisableThoughtsTotal: number;
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

export type CloseFn = () => Promise<void> | void;

export type ProcessThought = (
  input: ThoughtData
) => ProcessResult | Promise<ProcessResult>;

export interface EngineLike {
  processThought: ProcessThought;
  close?: CloseFn;
}
