type WriteNote = (path: string, content: string) => Promise<void>;

export class NoteSaveQueue {
  private readonly tails = new Map<string, Promise<void>>();

  constructor(private readonly write: WriteNote) {}

  enqueue(path: string, content: string): Promise<void> {
    const previous = this.tails.get(path);
    const operation = previous
      ? previous.catch(() => undefined).then(() => this.write(path, content))
      : this.write(path, content);
    const tail = operation.catch(() => undefined);
    this.tails.set(path, tail);
    void tail.finally(() => {
      if (this.tails.get(path) === tail) {
        this.tails.delete(path);
      }
    });
    return operation;
  }

  pending(path: string): Promise<void> {
    return this.tails.get(path) ?? Promise.resolve();
  }
}
