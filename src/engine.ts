import type {
  ContextSummary,
  ProcessResult,
  StoredThought,
  ThoughtData,
} from './lib/types.js';

export class ThinkingEngine {
  private thoughts: StoredThought[] = [];
  private branches = new Map<string, StoredThought[]>();

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

    // Sequential thoughts should increment
    if (lastThought && input.thoughtNumber !== lastThought.thoughtNumber + 1) {
      // Warning, not error - allow flexibility
      console.error(
        `Warning: Expected thought ${String(
          lastThought.thoughtNumber + 1
        )}, got ${String(input.thoughtNumber)}`
      );
    }
  }

  private getBranchPath(input: ThoughtData): string[] {
    // Simple implementation: return current branch ID if present
    return input.branchId ? [input.branchId] : [];
  }

  private getCurrentBranch(): string | undefined {
    return this.thoughts.at(-1)?.branchId;
  }

  // Get all thoughts for a specific branch
  getBranchThoughts(branchId: string): StoredThought[] {
    return this.branches.get(branchId) ?? [];
  }

  // Get main line thoughts (no branch)
  getMainLineThoughts(): StoredThought[] {
    return this.thoughts.filter((t) => !t.branchId);
  }

  // Reset for new session
  reset(): void {
    this.thoughts = [];
    this.branches.clear();
  }
}
