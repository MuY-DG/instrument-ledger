interface Job {
  priority: number;
  signal: AbortSignal;
  run: () => Promise<void>;
  resolve: () => void;
  reject: (e: unknown) => void;
}
// Both thumbnails and page canvases share a bounded queue. Visible pages run first.
class RenderQueue {
  private running = 0;
  private jobs: Job[] = [];
  schedule(run: () => Promise<void>, signal: AbortSignal, priority = 0) {
    return new Promise<void>((resolve, reject) => {
      if (signal.aborted) {
        resolve();
        return;
      }
      this.jobs.push({ run, signal, priority, resolve, reject });
      this.jobs.sort((a, b) => b.priority - a.priority);
      this.pump();
    });
  }
  private pump() {
    while (this.running < 2 && this.jobs.length) {
      const job = this.jobs.shift()!;
      if (job.signal.aborted) {
        job.resolve();
        continue;
      }
      this.running++;
      job
        .run()
        .then(job.resolve, job.reject)
        .finally(() => {
          this.running--;
          this.pump();
        });
    }
  }
}
export const renderQueue = new RenderQueue();
