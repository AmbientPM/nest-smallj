import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Keypair, Asset } from 'stellar-sdk';
import { Mutex } from 'async-mutex';
import { TransactionQueue, QueueTransaction } from './transaction-queue';
import { TransactionSenderService } from './transaction-sender.service';

/**
 * DistributorQueueService
 * 
 * Manages multiple distributor wallets working in parallel to process transactions faster.
 * 
 * WHY MULTIPLE DISTRIBUTORS?
 * 
 * Blockchain limitation: Each wallet can only send ONE transaction per block (~5 seconds).
 * 
 * Problem: If we have 1000 transactions and 1 distributor:
 * - Time needed = 1000 transactions × 5 seconds = 83 minutes!
 * 
 * Solution: Use 10 distributors in parallel:
 * - Time needed = 100 transactions × 5 seconds = 8.3 minutes!
 * 
 * HOW IT WORKS:
 * 
 * 1. Multiple Queues:
 *    - Each distributor wallet has its own TransactionQueue
 *    - Each queue processes transactions independently
 *    - All queues run simultaneously (parallel processing)
 * 
 * 2. Load Balancing:
 *    - When new transactions arrive, find the distributor with smallest queue
 *    - Send transactions to that distributor
 *    - This distributes work evenly across all distributors
 * 
 * 3. Dynamic Updates:
 *    - Every 60 seconds, check database for new/removed distributors
 *    - Add queues for new distributors
 *    - Remove queues for inactive distributors
 * 
 * 4. Batching:
 *    - Split incoming transactions into batches of 100
 *    - Each batch becomes one item in a queue
 *    - Stellar allows max 100 operations per transaction
 * 
 * EXAMPLE:
 * 
 * 500 transactions arrive:
 * - Distributor 1 queue: 50 items → Gets next 100 transactions
 * - Distributor 2 queue: 100 items → Skip (busy)
 * - Distributor 3 queue: 75 items → Skip (busier than #1)
 * 
 * Result: Transaction goes to Distributor 1 (least busy)
 * 
 * THREAD SAFETY:
 * Uses Mutex (mutual exclusion lock) to prevent race conditions when
 * multiple threads try to add transactions simultaneously.
 */
@Injectable()
export class DistributorQueueService implements OnModuleInit {
  private readonly logger = new Logger(DistributorQueueService.name);
  
  // Check for new/removed distributors every 60 seconds
  private readonly UPDATE_QUEUES_INTERVAL = 60 * 1000;

  // Map of distributor ID → transaction queue
  private queues: Map<number, TransactionQueue> = new Map();
  
  // Temporary storage while distributing to queues
  private pendingOperations: QueueTransaction[] = [];
  
  // Mutex prevents race conditions when adding transactions
  private readonly appendMutex = new Mutex();
  
  // Wallets that can create new tokens (for refilling distributors)
  private issuers: Keypair[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly senderService: TransactionSenderService,
  ) {}

  /**
   * Initialize on application startup
   * Sets up all distributor queues and starts periodic updates
   */
  async onModuleInit() {
    await this.initialize();
    this.startPeriodicUpdates();
  }

  /**
   * Load distributors from database and create queues
   */
  private async initialize(): Promise<void> {
    await this.updateQueues();
    await this.updateIssuers();
    this.logger.log('Distributor queues initialized');
  }

  /**
   * Start background tasks that run periodically
   * - Update distributor queues every 60 seconds
   * - Update issuer wallets every 60 seconds
   */
  private startPeriodicUpdates(): void {
    setInterval(() => {
      this.updateQueues().catch((error) => {
        this.logger.error(`Failed to update queues: ${error.message}`);
      });
    }, this.UPDATE_QUEUES_INTERVAL);

    setInterval(() => {
      this.updateIssuers().catch((error) => {
        this.logger.error(`Failed to update issuers: ${error.message}`);
      });
    }, this.UPDATE_QUEUES_INTERVAL);
  }

  /**
   * Update distributor queues based on database
   */
  private async updateQueues(): Promise<void> {
    this.logger.log('Updating queues...');

    const distributors = await this.prisma.distributor.findMany({
      where: { isActive: true },
    });

    const distributorIds = distributors.map((d) => d.id);
    const currentIds = Array.from(this.queues.keys());

    // Remove queues for deleted/inactive distributors
    for (const id of currentIds) {
      if (!distributorIds.includes(id)) {
        const queue = this.queues.get(id);
        queue?.quit();
        this.queues.delete(id);
        this.logger.log(`Queue [${id}] deleted`);
      }
    }

    // Add new queues for new distributors
    for (const distributor of distributors) {
      if (!this.queues.has(distributor.id)) {
        try {
          if (!distributor.secretKey || distributor.secretKey.trim() === '') {
            this.logger.warn(
              `Queue [${distributor.id}] skipped: empty secret key`,
            );
            continue;
          }

          const keypair = Keypair.fromSecret(distributor.secretKey);
          const queue = this.senderService.createQueue(
            distributor.id.toString(),
            keypair,
          );

          this.queues.set(distributor.id, queue);
          this.logger.log(
            `Queue [${distributor.id}] created for ${keypair.publicKey()}`,
          );
        } catch (error) {
          this.logger.error(
            `Queue [${distributor.id}] failed to create: ${error.message}`,
          );
        }
      }
    }
  }

  /**
   * Update issuer keypairs from settings
   */
  private async updateIssuers(): Promise<void> {
    const settings = await this.prisma.settings.findFirst();
    const issuerSecret = settings?.issuerSecret;

    if (issuerSecret && issuerSecret.trim() !== '') {
      try {
        this.issuers = [Keypair.fromSecret(issuerSecret)];
        this.logger.debug('Issuer keypair loaded');
      } catch (error) {
        this.logger.error(`Failed to load issuer: ${error.message}`);
        this.issuers = [];
      }
    } else {
      this.issuers = [];
    }
  }

  /**
   * Get the queue with smallest size (least busy)
   */
  private getSmallestQueue(): TransactionQueue {
    if (this.queues.size === 0) {
      throw new Error('No distributor queues available');
    }

    let minQueue: TransactionQueue | null = null;
    let minSize = Infinity;
    let minId = 0;

    for (const [id, queue] of this.queues.entries()) {
      if (queue.size < minSize) {
        minSize = queue.size;
        minQueue = queue;
        minId = id;
      }
    }

    if (!minQueue) {
      throw new Error('No distributor queues available');
    }

    this.logger.log(
      `Smallest queue is [${minId}] with ${minSize} transactions`,
    );
    return minQueue;
  }

  /**
   * Append operations to the distributor queue system
   * Operations are batched and distributed to the least busy queue
   */
  async append(
    operations: QueueTransaction[],
    memo?: string,
    id?: string,
  ): Promise<void> {
    const release = await this.appendMutex.acquire();

    try {
      // Add to pending operations inside mutex to prevent race conditions
      this.pendingOperations.push(...operations);

      this.logger.log(
        `[${id}] ${operations.length} operations added, ${this.pendingOperations.length} total pending`,
      );

      // Process all pending operations
      while (this.pendingOperations.length > 0) {
        // Process in batches of 100 operations
        const batch = this.pendingOperations.splice(0, 100);

        try {
          const queue = this.getSmallestQueue();

          await queue.append({
            transactions: batch,
            memo,
            issuers: [...this.issuers], // Clone to prevent mutation
            id: id || 'unknown',
          });

          this.logger.log(
            `[${id}] ${batch.length} operations sent to queue, ${this.pendingOperations.length} remaining`,
          );
        } catch (error) {
          this.logger.error(
            `[${id}] Failed to append to queue: ${error.message}`,
          );
          // Put batch back at the front
          this.pendingOperations.unshift(...batch);
          throw error;
        }
      }
    } finally {
      release();
    }
  }
}
