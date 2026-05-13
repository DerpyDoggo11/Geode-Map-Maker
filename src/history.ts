/** A single reversible operation. */
export interface Command {
  /** Short label for debugging / display. */
  label: string;
  /** Apply or re-apply the change. Called on initial push and on redo. */
  do(): void;
  /** Reverse the change. */
  undo(): void;
}

/**
 * Linear undo/redo stack with bounded capacity. New commands invalidate
 * the redo branch — standard editor semantics.
 */
export class History {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private capacity: number;
  /** Called whenever can-undo / can-redo changes — wire to UI button state. */
  onChange: () => void = () => {};

  constructor(capacity = 100) {
    this.capacity = capacity;
  }

  /**
   * Run a command for the first time and record it. Use this for any
   * state mutation that should be undoable; pass an already-prepared
   * Command whose do()/undo() captures the minimum needed data.
   */
  execute(cmd: Command): void {
    cmd.do();
    this.undoStack.push(cmd);
    if (this.undoStack.length > this.capacity) this.undoStack.shift();
    this.redoStack.length = 0;
    this.onChange();
  }

  undo(): void {
    const cmd = this.undoStack.pop();
    if (!cmd) return;
    cmd.undo();
    this.redoStack.push(cmd);
    this.onChange();
  }

  redo(): void {
    const cmd = this.redoStack.pop();
    if (!cmd) return;
    cmd.do();
    this.undoStack.push(cmd);
    this.onChange();
  }

  /** Wipe the entire history. Call on map rebuild / load. */
  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.onChange();
  }

  canUndo(): boolean { return this.undoStack.length > 0; }
  canRedo(): boolean { return this.redoStack.length > 0; }
}
