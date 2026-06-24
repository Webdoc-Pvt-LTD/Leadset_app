/**
 * Manages a single shared concurrency budget across all currently-running
 * file jobs. When 1 job is active, it gets the full budget. When 2 jobs are
 * active, each gets roughly half — automatically, and live: if a second job
 * starts mid-way through the first, the first job's allowed concurrency
 * drops immediately, and rises back when the second finishes.
 *
 * This replaces per-job `pLimit(...)` with a shared, rebalancing pool.
 */

class DynamicSemaphore {
  constructor(initialLimit) {
    this.limit = initialLimit;
    this.active = 0;
    this.queue = [];
  }

  setLimit(n) {
    this.limit = Math.max(1, n);
    this._drain();
  }

  run(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this._drain();
    });
  }

  _drain() {
    while (this.active < this.limit && this.queue.length > 0) {
      const { fn, resolve, reject } = this.queue.shift();
      this.active++;
      Promise.resolve()
        .then(fn)
        .then(resolve, reject)
        .finally(() => {
          this.active--;
          this._drain();
        });
    }
  }
}

class JobBudgetManager {
  constructor(totalBudget) {
    this.totalBudget = totalBudget;
    this.semaphores = new Map(); // jobId -> DynamicSemaphore
  }

  /** Call once when a job starts processing. Returns its semaphore. */
  register(jobId) {
    const sem = new DynamicSemaphore(this.totalBudget);
    this.semaphores.set(jobId, sem);
    this._rebalance();
    console.log(
      `⚖️  Job ${jobId} registered. Active jobs: ${this.semaphores.size}, ` +
        `each gets ~${Math.floor(this.totalBudget / this.semaphores.size)} concurrent slots.`,
    );
    return sem;
  }

  /** Call when a job finishes (success or failure) so its share is freed up. */
  unregister(jobId) {
    this.semaphores.delete(jobId);
    this._rebalance();
    if (this.semaphores.size > 0) {
      console.log(
        `⚖️  Job ${jobId} done. Remaining ${this.semaphores.size} job(s) rebalanced to ` +
          `~${Math.floor(this.totalBudget / this.semaphores.size)} slots each.`,
      );
    }
  }

  _rebalance() {
    const n = this.semaphores.size || 1;
    const share = Math.floor(this.totalBudget / n);
    for (const sem of this.semaphores.values()) {
      sem.setLimit(share);
    }
  }
}

// TOTAL_WORKER_BUDGET = total concurrent HTTP calls allowed across ALL active
// jobs combined. Size this from the latency table above, not an arbitrary
// "10" — e.g. if avg latency is 150ms and you need 278 rec/s, set this to
// ~45+ . Tune upward until the downstream API's error rate starts climbing.
module.exports = new JobBudgetManager(
  Number(process.env.TOTAL_WORKER_BUDGET) || 60,
);
