import { publishEngineEvent } from './lib/diagnostics.js';
import type {
  ContextSummary,
  ProcessResult,
  StoredThought,
  ThoughtData,
} from './lib/types.js';

const DEFAULT_MAX_THOUGHTS = 500;
const MAX_THOUGHTS_CAP = 10000;
const MAX_MEMORY_BYTES = 100 * 1024 * 1024; // 100MB soft cap
const ESTIMATED_THOUGHT_OVERHEAD_BYTES = 200;

function normalizeMaxThoughts(value?: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_MAX_THOUGHTS;
  }
  const clamped = Math.max(1, Math.min(MAX_THOUGHTS_CAP, Math.trunc(value)));
  return clamped;
}

export class ThinkingEngine {
  private thoughts: StoredThought[] = [];
  private branches = new Map<string, StoredThought[]>();
  private readonly maxThoughts: number;

  constructor(maxThoughts?: number) {
    this.maxThoughts = normalizeMaxThoughts(maxThoughts);
  }

  processThought(input: ThoughtData): ProcessResult {
    // 1. Validate sequence
    this.validateThoughtNumber(input);

    // 2. Auto-adjust totalThoughts if needed
    const totalThoughts = Math.max(input.totalThoughts, input.thoughtNumber);

    // 3. Store thought
    const stored: StoredThought = {
      ...input,
      totalThoughts,
      timestamp: Date.now(),
      branchPath: this.getBranchPath(input),
    };

    this.thoughts.push(stored);

    // 4. Track branches
    if (input.branchId) {
      const branch = this.branches.get(input.branchId) ?? [];
      branch.push(stored);
      this.branches.set(input.branchId, branch);
    }

    this.pruneHistoryIfNeeded();

    // 5. Build context summary (not full history!)
    const context = this.buildContextSummary();

    return {
      ok: true,
      result: {
        thoughtNumber: stored.thoughtNumber,
        totalThoughts: stored.totalThoughts,
        nextThoughtNeeded: input.nextThoughtNeeded,
        thoughtHistoryLength: this.thoughts.length,
        branches: Array.from(this.branches.keys()),
        context,
      },
    };
  }

  private buildContextSummary(): ContextSummary {
    const recent = this.thoughts.slice(-5);
    return {
      recentThoughts: recent.map((t) => ({
        number: t.thoughtNumber,
        preview:
          t.thought.slice(0, 100) + (t.thought.length > 100 ? '...' : ''),
        type: t.thoughtType,
      })),
      currentBranch: this.getCurrentBranch(),
      hasRevisions: this.thoughts.some((t) => t.isRevision),
    };
  }

  private validateThoughtNumber(input: ThoughtData): void {
    const lastThought = this.thoughts.at(-1);

    // First thought must be 1
    if (!lastThought && input.thoughtNumber !== 1) {
      throw new Error(
        `First thought must be number 1, got ${String(input.thoughtNumber)}`
      );
    }

    // Revisions and branches can have any valid number
    if (input.isRevision || input.branchFromThought) {
      return;
    }

    // Warn on non-sequential numbers (don't error - may be intentional)
    if (lastThought && input.thoughtNumber !== lastThought.thoughtNumber + 1) {
      publishEngineEvent({
        type: 'engine.sequence_gap',
        ts: Date.now(),
        expected: lastThought.thoughtNumber + 1,
        received: input.thoughtNumber,
      });
    }
  }

  private pruneHistoryIfNeeded(): void {
    // Count-based pruning
    let pruned = false;
    const excess = this.thoughts.length - this.maxThoughts;
    if (excess > 0) {
      this.thoughts.splice(0, excess);
      pruned = true;
    }

    // Memory-aware pruning: estimate current memory usage
    const estimatedBytes = this.thoughts.reduce((sum, t) => {
      return sum + t.thought.length * 2 + ESTIMATED_THOUGHT_OVERHEAD_BYTES;
    }, 0);

    if (estimatedBytes > MAX_MEMORY_BYTES && this.thoughts.length > 10) {
      // Prune oldest 20% when over memory threshold
      const toRemove = Math.ceil(this.thoughts.length * 0.2);
      this.thoughts.splice(0, toRemove);
      pruned = true;
    }

    if (pruned) {
      this.rebuildBranches();
    }
  }

  private rebuildBranches(): void {
    this.branches = new Map<string, StoredThought[]>();
    for (const thought of this.thoughts) {
      if (!thought.branchId) continue;
      const branch = this.branches.get(thought.branchId) ?? [];
      branch.push(thought);
      this.branches.set(thought.branchId, branch);
    }
  }

  private getBranchPath(input: ThoughtData): string[] {
    return input.branchId ? [input.branchId] : [];
  }

  private getCurrentBranch(): string | undefined {
    return this.thoughts.at(-1)?.branchId;
  }
}
