import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StellarService } from './services/stellar.service';
import { XRPService } from './services/xrp.service';
import { TierService } from './services/tier.service';
import { StakingService } from './services/staking.service';
import { DistributorQueueService } from './services/distributor-queue.service';
import { DatabaseModule } from '../database/database.module';

/**
 * BlockchainModule
 * 
 * This module handles all blockchain-related operations for the application.
 * It manages interactions with both Stellar and XRP Ledger networks.
 * 
 * KEY SERVICES:
 * 
 * 1. StellarService - Low-level Stellar blockchain operations
 *    - Send tokens between wallets
 *    - Create trust lines (permission to receive tokens)
 *    - Query account balances and holders
 *    - Create claimable balances (tokens that can be claimed later)
 * 
 * 2. DistributorQueueService - Smart transaction distribution system
 *    - Manages multiple distributor wallets working in parallel
 *    - Distributes transactions across distributors for faster processing
 *    - Handles automatic error recovery (insufficient funds, missing trust lines)
 *    - Prevents transaction loss through robust retry logic
 * 
 * 3. StakingService - Automated reward distribution
 *    - Calculates hourly rewards based on user balances
 *    - Different reward rates for different balance tiers
 *    - Automatically sends rewards through the distributor queue
 * 
 * 4. TierService - Reward calculation logic
 *    - Determines reward percentages based on balance tiers
 *    - Example: 0-1000 tokens = 1%, 1000-5000 = 2%, 5000+ = 3%
 * 
 * 5. XRPService - XRP Ledger operations
 *    - Validate XRP addresses
 *    - Check for incoming payments
 *    - Query account balances
 * 
 * BLOCKCHAIN CONCEPTS:
 * 
 * - Transaction: An instruction to perform an action on the blockchain
 *   (e.g., send 100 tokens from Alice to Bob)
 * 
 * - Operation: A single action within a transaction
 *   (Stellar allows bundling up to 100 operations in one transaction)
 * 
 * - Trust Line: Permission for an account to receive a specific token
 *   (Like opening a bank account for a specific currency)
 * 
 * - Distributor: A wallet that sends tokens on behalf of the system
 *   (We use multiple distributors to process transactions in parallel)
 * 
 * - Claimable Balance: Tokens sent that recipient can claim later
 *   (Used when recipient doesn't have a trust line yet)
 */
@Module({
    imports: [ConfigModule, DatabaseModule],
    providers: [
        StellarService,
        XRPService,
        TierService,
        DistributorQueueService,
        StakingService,
    ],
    exports: [
        StellarService,
        XRPService,
        TierService,
        StakingService,
        DistributorQueueService,
    ],
})
export class BlockchainModule { }
