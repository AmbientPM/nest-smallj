import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { StellarService } from './stellar.service';
import { Keypair, Asset } from 'stellar-sdk';
import {
  TransactionQueue,
  QueueItem,
  QueueTransaction,
} from './transaction-queue';

/**
 * TransactionSenderService
 * 
 * The "brain" of the transaction sending system. Handles all the complex logic
 * for sending transactions to the Stellar blockchain with automatic error recovery.
 * 
 * KEY RESPONSIBILITIES:
 * 1. Batch transactions efficiently (up to 100 operations per blockchain transaction)
 * 2. Handle large transactions separately (to avoid blockchain limits)
 * 3. Automatically recover from errors:
 *    - Insufficient funds → Refill from issuer
 *    - Missing trust lines → Add trust line automatically
 *    - No recipient trust → Convert to claimable balance
 * 4. Prevent infinite loops with smart retry limits
 * 5. Create transaction queues for each distributor
 * 
 * BLOCKCHAIN CONCEPTS:
 * 
 * - Distributor: A wallet that sends tokens on behalf of the system
 *   (Think of it like a cashier at a bank - processes many transactions)
 * 
 * - Issuer: The wallet that creates new tokens
 *   (Think of it like the Federal Reserve - can print money)
 * 
 * - Trust Line: Permission to receive a specific token
 *   (Like opening an account for a specific currency)
 * 
 * - Claimable Balance: Tokens sent that recipient can claim later
 *   (Like a check that can be deposited later)
 * 
 * ERROR RECOVERY:
 * The blockchain can fail for many reasons. This service automatically handles:
 * - op_underfunded: Distributor out of tokens → Refill from issuer
 * - op_src_no_trust: Distributor missing trust line → Add it
 * - op_no_trust: Recipient missing trust line → Send as claimable balance
 * - op_malformed: Invalid transaction → Skip it
 * - tx_insufficient_balance: Out of XLM (gas) → Refill XLM
 * - 500 errors: Server issues → Retry with backoff
 */
@Injectable()
export class TransactionSenderService {
  private readonly logger = new Logger(TransactionSenderService.name);
  
  // Wait 60 seconds when admin stops sending
  private readonly STOP_SENDING_INTERVAL = 60;
  
  // Max tokens to send in one operation (to avoid blockchain limits)
  private readonly SUPPLY_REFILL_LIMIT = 900_000_000_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stellar: StellarService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Send a batch of transactions with automatic error recovery
   * 
   * ALGORITHM:
   * 1. Sort transactions by amount (largest first)
   *    - Helps identify large transactions early
   *    - Optimizes blockchain space usage
   * 
   * 2. Process in batches of up to 100 transactions
   *    - Stellar allows max 100 operations per transaction
   * 
   * 3. For each batch:
   *    a. Check if sending is enabled (admin can pause)
   *    b. Check for large transactions (> 900B tokens)
   *       - Send separately to avoid hitting limits
   *    c. Send the batch to blockchain
   *    d. If error: analyze and recover automatically
   * 
   * 4. Error recovery strategies:
   *    - Server error (500): Retry up to 3 times with backoff
   *    - Invalid transactions: Remove from batch and continue
   *    - Underfunded: Move to end of queue (will succeed after refill)
   *    - Missing trust: Add trust line and retry
   * 
   * 5. Loop protections:
   *    - moveToEnd flag: Transaction can only be moved once
   *    - operationErrorRetry: Max 5 retries if stuck
   *    - badResponseRetry: Max 3 retries for server errors
   * 
   * @param distributor - The wallet sending the tokens
   * @param transactions - Array of token transfers to execute
   * @param memo - Optional note attached to the transaction
   * @param issuers - Wallets that can create tokens (for refilling)
   * @param id - Identifier for logging
   * @returns {success: boolean, error?: string}
   */
  async sendTransactions(
    distributor: Keypair,
    transactions: QueueTransaction[],
    memo?: string,
    issuers: Keypair[] = [],
    id?: string,
  ): Promise<{ success: boolean; error?: string }> {
    // Sort transactions by amount (largest first) to optimize batch processing
    const transactionsSorted = [...transactions].sort(
      (a, b) => b.amount - a.amount,
    );
    let transactionsLeft = [...transactionsSorted];

    while (transactionsLeft.length > 0) {
      const originalBatchSize = Math.min(100, transactionsLeft.length);
      let currentBatch = transactionsLeft.slice(0, originalBatchSize);
      let badResponseRetry = 0;
      let operationErrorRetry = 0;
      const MAX_OPERATION_RETRIES = 5;

      while (true) {
        try {
          this.logger.log(
            `Sender:${id} Sending ${currentBatch.length} transactions...`,
          );

          // Check if sending is enabled
          const settings = await this.prisma.settings.findFirst();
          if (!settings?.sendingEnabled) {
            this.logger.log(
              `Sender:${id} Sending stopped by admin, waiting ${this.STOP_SENDING_INTERVAL}s`,
            );
            await new Promise((resolve) =>
              setTimeout(resolve, this.STOP_SENDING_INTERVAL * 1000),
            );
            continue;
          }

          // Check for large transactions that should be sent separately
          const largeIdx = currentBatch.findIndex(
            (t) => t.amount >= this.SUPPLY_REFILL_LIMIT,
          );

          if (largeIdx !== -1) {
            this.logger.log(
              `Sender:${id} Large transaction detected at index ${largeIdx}, sending separately`,
            );
            const largeTx = { ...currentBatch[largeIdx] }; // Clone to avoid mutation
            largeTx.amount = this.SUPPLY_REFILL_LIMIT - 1;

            const hash = await this.stellar.sendMultipleTokens(
              distributor,
              [largeTx],
              memo,
            );
            this.logger.log(`Sender:${id} Large tx sent: ${hash}`);

            // Remove the large transaction from both currentBatch and transactionsLeft
            const absoluteIdx = transactionsLeft.findIndex(
              (t) => t === currentBatch[largeIdx],
            );
            if (absoluteIdx !== -1) {
              transactionsLeft.splice(absoluteIdx, 1);
            }
            currentBatch.splice(largeIdx, 1);
            
            // If batch is now empty, break to next batch
            if (currentBatch.length === 0) {
              break;
            }
            continue;
          }

          // Send the batch
          const hash = await this.stellar.sendMultipleTokens(
            distributor,
            currentBatch,
            memo,
          );
          this.logger.log(`Sender:${id} tx_hash: ${hash}`);

          // Remove processed batch from the list
          transactionsLeft = transactionsLeft.slice(currentBatch.length);
          break;

        } catch (error) {
          const errorResult = await this.handleSendError(
            error,
            distributor,
            currentBatch,
            transactionsLeft,
            issuers,
            id,
          );

          if (errorResult.retry) {
            badResponseRetry++;
            if (badResponseRetry >= 3) {
              this.logger.error(`Sender:${id} Max retries reached`);
              return { success: false, error: error.message };
            }
            this.logger.log(
              `Sender:${id} Retrying (attempt ${badResponseRetry}/3)`,
            );
            await new Promise((resolve) =>
              setTimeout(resolve, Math.pow(3, badResponseRetry) * 1000),
            );
            continue;
          }

          // Add moveToEnd transactions if any
          if (errorResult.moveToEndIndices && errorResult.moveToEndIndices.length > 0) {
            // Process moveToEnd indices - check if already moved before
            const actualMoveToEnd: number[] = [];
            const alreadyMoved: number[] = [];
            
            for (const idx of errorResult.moveToEndIndices) {
              const tx = currentBatch[idx];
              
              // If already moved once, mark as invalid instead
              if (tx.movedToEnd) {
                this.logger.warn(
                  `Sender:${id} Transaction at index ${idx} already moved to end once, marking as invalid`,
                );
                alreadyMoved.push(idx);
              } else {
                // Mark and push to end
                tx.movedToEnd = true;
                transactionsLeft.push(tx);
                actualMoveToEnd.push(idx);
              }
            }
            
            // Update indices arrays: add alreadyMoved to invalid, replace moveToEnd with actual
            if (alreadyMoved.length > 0) {
              if (!errorResult.invalidIndices) {
                errorResult.invalidIndices = [];
              }
              errorResult.invalidIndices.push(...alreadyMoved);
            }
            errorResult.moveToEndIndices = actualMoveToEnd;
          }

          if (errorResult.invalidIndices !== undefined || errorResult.moveToEndIndices !== undefined) {
            // Collect all indices to remove (both invalid and moveToEnd)
            const indicesToRemove = new Set([
              ...(errorResult.invalidIndices || []),
              ...(errorResult.moveToEndIndices || []),
            ]);

            // If no indices to remove, it means all operations need retry but none are invalid/moveToEnd
            // This could happen if all ops were fixed (trustline added, tokens refilled)
            if (indicesToRemove.size === 0) {
              operationErrorRetry++;
              if (operationErrorRetry >= MAX_OPERATION_RETRIES) {
                this.logger.error(
                  `Sender:${id} Max operation retries (${MAX_OPERATION_RETRIES}) reached, skipping batch`,
                );
                // Skip this entire batch to avoid infinite loop
                transactionsLeft = transactionsLeft.slice(originalBatchSize);
                break;
              }
              this.logger.log(
                `Sender:${id} No transactions removed, retrying (${operationErrorRetry}/${MAX_OPERATION_RETRIES})`,
              );
              await new Promise((resolve) => setTimeout(resolve, 1000));
              continue;
            }

            // Remove from both arrays by index (from back to front to avoid index shifting)
            const sortedIndices = Array.from(indicesToRemove).sort((a, b) => b - a);
            for (const idx of sortedIndices) {
              currentBatch.splice(idx, 1);
              transactionsLeft.splice(idx, 1);
            }

            this.logger.log(
              `Sender:${id} Removed ${sortedIndices.length} transactions from batch (${errorResult.invalidIndices?.length || 0} invalid, ${errorResult.moveToEndIndices?.length || 0} moved to end)`,
            );
            
            // Reset operation retry counter since we made progress
            operationErrorRetry = 0;
            
            // If batch is empty after filtering, skip to next batch
            if (currentBatch.length === 0) {
              break; // Exit inner loop to process next batch
            }
            // Otherwise, retry with the updated batch (stay in inner loop)
            continue;
          }

          if (errorResult.fatal) {
            return { success: false, error: error.message };
          }
          
          // If we get here, something went wrong without a clear retry/update
          // Skip the current batch to avoid infinite loop
          this.logger.error(
            `Sender:${id} Unknown error state, skipping batch of ${currentBatch.length} transactions`,
          );
          transactionsLeft = transactionsLeft.slice(originalBatchSize);
          break;
        }
      }
    }

    return { success: true };
  }

  /**
   * Handle errors from stellar transactions
   */
  private async handleSendError(
    error: any,
    distributor: Keypair,
    currentBatch: QueueTransaction[],
    transactionsLeft: QueueTransaction[],
    issuers: Keypair[],
    id?: string,
  ): Promise<{
    retry: boolean;
    invalidIndices?: number[];
    moveToEndIndices?: number[];
    fatal?: boolean;
  }> {
    // Check for BadResponseError
    if (error.response?.status >= 500) {
      return { retry: true };
    }

    // Parse Stellar error codes
    let resultCodes: any = null;
    try {
      // Check if error is StellarAPIError with originalError
      if (error?.originalError?.response?.data?.extras?.result_codes) {
        resultCodes = error.originalError.response.data.extras.result_codes;
      } else if (error.response?.data?.extras?.result_codes) {
        resultCodes = error.response.data.extras.result_codes;
      }
    } catch (e) {
      this.logger.error(`Sender:${id} Could not parse error: ${e.message}`);
      return { retry: true };
    }

    if (!resultCodes) {
      this.logger.error(`Sender:${id} Unknown error: ${error.message}`);
      return { retry: true };
    }

    // Handle transaction-level errors
    if (resultCodes.transaction === 'tx_insufficient_balance') {
      await this.refillXLM(distributor, id);
      return { retry: true };
    }

    // Handle operation-level errors
    const operations = resultCodes.operations;
    if (!operations || !Array.isArray(operations)) {
      return { retry: true };
    }

    const invalidIndices: number[] = [];
    const moveToEndIndices: number[] = [];
    const convertToClaimable: number[] = [];

    for (let i = 0; i < operations.length; i++) {
      if (i >= currentBatch.length) continue;

      const opCode = operations[i];

      if (opCode === 'op_success') {
        continue;
      }

      this.logger.warn(`Sender:${id} Operation ${i} failed: ${opCode}`);

      if (opCode === 'op_no_trust') {
        // Convert to claimable balance
        convertToClaimable.push(i);
        this.logger.log(
          `Sender:${id} No trust line at index ${i}, converting to claimable balance`,
        );
      } else if (opCode === 'op_malformed' || opCode === 'op_line_full') {
        invalidIndices.push(i);
      } else if (opCode === 'op_src_no_trust') {
        // Distributor needs trustline
        const added = await this.addTrustline(
          distributor,
          currentBatch[i].asset,
          id,
        );
        if (!added) {
          invalidIndices.push(i);
        }
      } else if (opCode === 'op_underfunded') {
        // Distributor needs tokens
        const refilled = await this.refillTokens(
          distributor,
          currentBatch[i].asset,
          issuers,
          id,
        );
        if (!refilled) {
          // Move to end of queue to try later
          this.logger.warn(
            `Sender:${id} Moving underfunded tx at index ${i} to end of queue`,
          );
          moveToEndIndices.push(i);
        }
      } else {
        invalidIndices.push(i);
      }
    }

    // Apply claimable balance conversions
    for (const idx of convertToClaimable) {
      currentBatch[idx].type = 'claimable_balance';
    }

    this.logger.warn(
      `Sender:${id} Invalid: ${invalidIndices.length}, MoveToEnd: ${moveToEndIndices.length}, ConvertToClaimable: ${convertToClaimable.length}`,
    );

    return { retry: false, invalidIndices, moveToEndIndices };
  }

  /**
   * Refill XLM to distributor
   */
  private async refillXLM(distributor: Keypair, id?: string): Promise<void> {
    try {
      const refillSecret = this.configService.get<string>(
        'STELLAR_REFILL_SECRET',
      );
      if (!refillSecret) {
        this.logger.error(`Sender:${id} No refill secret configured`);
        return;
      }

      const refillKeypair = Keypair.fromSecret(refillSecret);
      await this.stellar.sendTokens(
        refillKeypair,
        10,
        Asset.native(),
        distributor.publicKey(),
      );

      this.logger.log(`Sender:${id} Refilled 10 XLM to distributor`);
    } catch (error) {
      this.logger.error(`Sender:${id} Could not refill XLM: ${error.message}`);
    }
  }

  /**
   * Add trustline to distributor
   */
  private async addTrustline(
    distributor: Keypair,
    asset: Asset,
    id?: string,
  ): Promise<boolean> {
    try {
      this.logger.log(`Sender:${id} Adding trustline to ${asset.getCode()}`);
      await this.stellar.trust(distributor, asset);
      this.logger.log(`Sender:${id} Trustline added successfully`);
      return true;
    } catch (error) {
      this.logger.error(
        `Sender:${id} Could not add trustline: ${error.message}`,
      );
      return false;
    }
  }

  /**
   * Refill tokens to distributor from issuer
   */
  private async refillTokens(
    distributor: Keypair,
    asset: Asset,
    issuers: Keypair[],
    id?: string,
  ): Promise<boolean> {
    try {
      const issuer = issuers.find((i) => i.publicKey() === asset.getIssuer());
      if (!issuer) {
        this.logger.error(
          `Sender:${id} No issuer found for ${asset.getCode()}`,
        );
        return false;
      }

      const distributorBalance = await this.stellar.getBalance(
        distributor.publicKey(),
        asset,
      );
      const refillAmount = Math.floor(
        this.SUPPLY_REFILL_LIMIT - distributorBalance,
      );

      if (refillAmount <= 0) {
        this.logger.warn(
          `Sender:${id} Distributor already has enough ${asset.getCode()}`,
        );
        return false;
      }

      this.logger.log(
        `Sender:${id} Refilling ${refillAmount} ${asset.getCode()}...`,
      );
      await this.stellar.generateToken(
        asset.getCode(),
        refillAmount,
        issuer,
        distributor,
      );
      this.logger.log(`Sender:${id} Refilled successfully`);
      return true;
    } catch (error) {
      this.logger.error(
        `Sender:${id} Could not refill tokens: ${error.message}`,
      );
      return false;
    }
  }

  /**
   * Create a transaction queue for a specific distributor
   */
  createQueue(id: string, distributor: Keypair): TransactionQueue {
    return new TransactionQueue(id, async (item: QueueItem) => {
      const result = await this.sendTransactions(
        distributor,
        item.transactions,
        item.memo,
        item.issuers,
        item.id,
      );

      if (!result.success) {
        throw new Error(result.error || 'Unknown error');
      }
    });
  }
}
