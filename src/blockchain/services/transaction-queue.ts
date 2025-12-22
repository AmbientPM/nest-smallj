import { Logger } from '@nestjs/common';
import { Keypair, Asset } from 'stellar-sdk';
import { Mutex } from 'async-mutex';

/**
 * QueueTransaction Interface
 * 
 * Represents a single token transfer operation that needs to be executed on the blockchain.
 * 
 * FIELDS:
 * - destination: The recipient's wallet address (public key)
 * - asset: The token being sent (e.g., USD, NWO, or native XLM)
 * - amount: How many tokens to send (e.g., 100.5)
 * - type: How to send the tokens:
 *   * 'payment': Direct transfer (requires recipient has trust line)
 *   * 'claimable_balance': Recipient can claim later (no trust line needed)
 * - movedToEnd: Flag to prevent infinite retry loops
 *   * If transaction fails due to insufficient funds, we move it to end of queue
 *   * If it fails again after being moved once, we mark it as invalid
 */
export interface QueueTransaction {
  destination: string;
  asset: Asset;
  amount: number;
  type?: 'payment' | 'claimable_balance';
  movedToEnd?: boolean; // Track if already moved to end once
}

/**
 * QueueItem Interface
 * 
 * Represents a batch of transactions to be processed together.
 * 
 * WHY BATCH TRANSACTIONS?
 * Stellar allows up to 100 operations in a single blockchain transaction.
 * This is much more efficient than sending 100 separate transactions.
 * 
 * FIELDS:
 * - transactions: Array of token transfers to execute together (max 100)
 * - memo: Optional text note attached to the blockchain transaction
 * - issuers: Wallet(s) that can create new tokens (for refilling distributors)
 * - id: Unique identifier for tracking and logging
 * - retryCount: How many times we've tried to process this batch
 *   * Prevents infinite retry loops (max 10 attempts)
 */
export interface QueueItem {
  transactions: QueueTransaction[];
  memo?: string;
  issuers: Keypair[];
  id: string;
  retryCount?: number;
}

/**
 * TransactionQueue Class
 * 
 * A background processing queue that handles one distributor's transactions.
 * 
 * HOW IT WORKS:
 * 1. Items (batches of transactions) are added to the queue via append()
 * 2. A background process continuously polls the queue
 * 3. Each item is processed (sent to blockchain) one at a time
 * 4. Failed items are retried up to 10 times before being dropped
 * 
 * WHY A QUEUE?
 * - Blockchain can only process one transaction per wallet per block (~5 seconds)
 * - Queueing ensures we don't try to send multiple transactions simultaneously
 * - Provides automatic retry logic for temporary failures
 * - Prevents overwhelming the blockchain network
 * 
 * KEY FEATURES:
 * - Mutex protection prevents race conditions
 * - Failed items retry with 5-second delay
 * - Processing runs in background (non-blocking)
 * - Can be stopped gracefully with quit()
 */
export class TransactionQueue {
  private queue: QueueItem[] = [];
  private processing = false;
  private active = true;
  private readonly appendMutex = new Mutex();
  private readonly MAX_ITEM_RETRIES = 10; // Max retries per queue item
  protected readonly logger: Logger;

  constructor(
    protected readonly id: string,
    private readonly processCallback: (item: QueueItem) => Promise<void>,
  ) {
    this.logger = new Logger(`TransactionQueue[${id}]`);
  }

  /**
   * Get the current number of items waiting in the queue
   * Used for load balancing across multiple distributors
   */
  get size(): number {
    return this.queue.length;
  }

  /**
   * Check if the queue is still running
   * Returns false after quit() is called
   */
  get isActive(): boolean {
    return this.active;
  }

  /**
   * Gracefully stop processing the queue
   * Current item will finish, but no new items will be processed
   */
  quit(): void {
    this.active = false;
    this.logger.log('Queue stopped');
  }

  /**
   * Add a batch of transactions to the queue for processing
   * 
   * THREAD-SAFETY:
   * Uses mutex to prevent race conditions when multiple threads
   * try to add items simultaneously.
   * 
   * PROCESS FLOW:
   * 1. Acquire mutex lock (wait if another thread is adding)
   * 2. Add item to queue
   * 3. Start background processing if not already running
   * 4. Release mutex lock
   * 
   * @param item - Batch of transactions to process
   */
  async append(item: QueueItem): Promise<void> {
    const release = await this.appendMutex.acquire();

    try {
      // LIFO - add to end, but we'll shift from beginning (oldest first behavior)
      // Actually Python uses LifoQueue which pops from end, but the logic processes FIFO
      this.queue.push(item);

      this.logger.log(
        `[${item.id}] Item added. Queue size: ${this.queue.length}`,
      );

      if (!this.processing) {
        this.startProcessing();
      }
    } finally {
      release();
    }
  }

  /**
   * Start the background processing loop
   * Runs asynchronously without blocking the caller
   */
  private startProcessing(): void {
    // Don't await - let it run in background
    this.process().catch((error) => {
      this.logger.error(`Processing error: ${error.message}`);
    });
  }

  /**
   * Main processing loop - runs continuously in the background
   * 
   * PROCESS FLOW:
   * 1. Wait 100ms between iterations (prevents CPU spinning)
   * 2. Get next item from queue (FIFO - first in, first out)
   * 3. Try to process it (send to blockchain)
   * 4. If success: move to next item
   * 5. If failure: increment retry count
   *    - If retries < 10: put back at front of queue, wait 5 seconds
   *    - If retries >= 10: drop item permanently (prevents infinite loops)
   * 6. Repeat until queue is empty or quit() is called
   * 
   * WHY RETRY LOGIC?
   * Blockchain operations can fail temporarily due to:
   * - Network issues
   * - Insufficient balance (waiting for refill)
   * - Rate limiting
   * - Horizon server temporarily down
   * 
   * Most failures are temporary and succeed on retry.
   */
  private async process(): Promise<void> {
    this.processing = true;

    while (this.active && this.queue.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 100));

      this.logger.log('Getting new item from queue...');
      const item = this.queue.shift();

      if (!item) continue;

      try {
        this.logger.log(`[${item.id}] Running task (retry: ${item.retryCount || 0})`);
        await this.processCallback(item);
        this.logger.log(`[${item.id}] Task finished successfully`);
      } catch (error) {
        const retryCount = (item.retryCount || 0) + 1;
        
        if (retryCount >= this.MAX_ITEM_RETRIES) {
          this.logger.error(
            `[${item.id}] Task failed after ${retryCount} attempts, dropping item: ${error.message}`,
          );
          continue; // Drop item and move to next
        }
        
        this.logger.error(
          `[${item.id}] Task failed (retry ${retryCount}/${this.MAX_ITEM_RETRIES}): ${error.message}`,
        );
        
        // Put the failed item back at front with incremented retry count
        item.retryCount = retryCount;
        this.queue.unshift(item);
        
        // Wait before processing again
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }

    this.processing = false;
    this.logger.log('Processing finished, queue is empty');
  }
}
