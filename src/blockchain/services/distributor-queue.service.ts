import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { StellarService } from './stellar.service';
import { Keypair, Asset } from 'stellar-sdk';

interface QueueTransaction {
    destination: string;
    asset: Asset;
    amount: number;
}

interface QueueItem {
    transactions: QueueTransaction[];
    memo?: string;
    issuers: Keypair[];
    id: string;
}

class TransactionQueue {
    private queue: QueueItem[] = [];
    private processing = false;
    private readonly logger = new Logger(TransactionQueue.name);

    constructor(
        private readonly stellar: StellarService,
        private readonly distributor: Keypair,
        private readonly id: string,
    ) { }

    get size(): number {
        return this.queue.length;
    }

    async append(item: QueueItem): Promise<void> {
        this.queue.push(item);
        this.logger.log(
            `[${this.id}] Item added to queue. Queue size: ${this.queue.length}`,
        );

        if (!this.processing) {
            await this.process();
        }
    }

    private async process(): Promise<void> {
        this.processing = true;

        while (this.queue.length > 0) {
            const item = this.queue.shift();
            if (!item) continue;

            try {
                this.logger.log(`[${item.id}] Processing ${item.transactions.length} transactions`);

                // Send in batches of 100 operations max
                const batches = this.chunkArray(item.transactions, 100);

                for (const batch of batches) {
                    const hash = await this.stellar.sendMultipleTokens(
                        this.distributor,
                        batch,
                        item.memo,
                    );

                    this.logger.log(`[${item.id}] Transaction sent: ${hash}`);
                }

                this.logger.log(`[${item.id}] Task finished successfully`);
            } catch (error) {
                this.logger.error(`[${item.id}] Error: ${error.message}`);
            }

            // Small delay between batches
            await new Promise((resolve) => setTimeout(resolve, 100));
        }

        this.processing = false;
    }

    private chunkArray<T>(array: T[], size: number): T[][] {
        const chunks: T[][] = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }
}

@Injectable()
export class DistributorQueueService implements OnModuleInit {
    private readonly logger = new Logger(DistributorQueueService.name);
    private queues: Map<number, TransactionQueue> = new Map();
    private pendingOperations: QueueTransaction[] = [];
    private isProcessing = false;
    private issuers: Keypair[] = [];

    constructor(
        private readonly prisma: PrismaService,
        private readonly stellar: StellarService,
    ) { }

    async onModuleInit() {
        await this.initialize();
    }

    async initialize(): Promise<void> {
        await this.updateQueues();
        await this.updateIssuers();

        // Start periodic updates
        setInterval(() => this.updateQueues(), 60 * 1000); // Every minute
    }

    private async updateQueues(): Promise<void> {
        this.logger.log('Updating queues');

        const distributors = await this.prisma.distributor.findMany({
            where: { isActive: true },
        });

        const distributorIds = distributors.map((d) => d.id);
        const currentIds = Array.from(this.queues.keys());

        // Remove queues for deleted distributors
        for (const id of currentIds) {
            if (!distributorIds.includes(id)) {
                this.queues.delete(id);
                this.logger.log(`Queue [${id}] deleted`);
            }
        }

        // Add new queues
        for (const distributor of distributors) {
            if (!this.queues.has(distributor.id)) {
                try {
                    // Validate secret key before creating keypair
                    if (!distributor.secretKey || distributor.secretKey.trim() === '') {
                        this.logger.warn(`Queue [${distributor.id}] skipped: empty secret key`);
                        continue;
                    }

                    const keypair = Keypair.fromSecret(distributor.secretKey);
                    const queue = new TransactionQueue(this.stellar, keypair, distributor.id.toString());
                    this.queues.set(distributor.id, queue);
                    this.logger.log(`Queue [${distributor.id}] created for ${keypair.publicKey()}`);
                } catch (error) {
                    this.logger.error(
                        `Queue [${distributor.id}] failed to create: ${error.message}. Invalid secret key.`,
                    );
                    // Continue to next distributor instead of crashing
                    continue;
                }
            }
        }
    }

    private async updateIssuers(): Promise<void> {
        const settings = await this.prisma.settings.findFirst();
        const issuerSecret = settings?.issuerSecret;

        if (issuerSecret && issuerSecret.trim() !== '') {
            try {
                this.issuers = [Keypair.fromSecret(issuerSecret)];
                this.logger.log('Issuer keypair loaded successfully');
            } catch (error) {
                this.logger.error(`Failed to load issuer keypair: ${error.message}`);
                this.issuers = [];
            }
        } else {
            this.issuers = [];
            this.logger.warn('No issuer secret found in settings');
        }
    }

    private getSmallestQueue(): TransactionQueue {
        if (this.queues.size === 0) {
            throw new Error('No queues available');
        }

        let minQueue: TransactionQueue | null = null;
        let minSize = Infinity;

        for (const [id, queue] of this.queues.entries()) {
            if (queue.size < minSize) {
                minSize = queue.size;
                minQueue = queue;
            }
        }

        if (!minQueue) {
            throw new Error('No queues available');
        }

        this.logger.log(`Smallest queue has ${minSize} transactions`);
        return minQueue;
    }

    async append(
        operations: QueueTransaction[],
        memo?: string,
        id?: string,
    ): Promise<void> {
        if (this.isProcessing) {
            this.logger.warn('Already processing, queueing operations');
            this.pendingOperations.push(...operations);
            return;
        }

        this.isProcessing = true;
        this.pendingOperations.push(...operations);

        this.logger.log(`[${id}] ${this.pendingOperations.length} operations added to pending`);

        try {
            while (this.pendingOperations.length > 0) {
                const batch = this.pendingOperations.splice(0, 100);
                const queue = this.getSmallestQueue();

                await queue.append({
                    transactions: batch,
                    memo,
                    issuers: this.issuers,
                    id: id || 'unknown',
                });

                this.logger.log(
                    `${batch.length} operations sent to queue, ${this.pendingOperations.length} left`,
                );
            }
        } catch (error) {
            this.logger.error(`Error in append: ${error.message}`);
        } finally {
            this.isProcessing = false;
        }
    }
}
