import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { StellarService } from './stellar.service';
import { Asset } from 'stellar-sdk';
import { TierService } from './tier.service';
import { DistributorQueueService } from './distributor-queue.service';

interface RewardData {
    asset_id: number;
    asset_name: string;
    asset_issuer: string;
    balance: number;
    earned: number;
    hourly_percent: number;
    last_update_timestamp: number;
    usd_price: number;
    icon: string;
    domain: string;
    is_premium: boolean;
}

@Injectable()
export class StakingService implements OnModuleInit {
    private readonly logger = new Logger(StakingService.name);
    private readonly REWARD_INTERVAL = 1; // hours
    private readonly TASK_INTERVAL = 60 * 5; // 5 minutes for production
    private readonly MAIN_ASSET = new Asset(
        'NWO',
        'GBQAV7QSBJHWVYPP5OHINHA2SSTNI7DN4QI2JSSZ6ZYE3QECGF576TNQ',
    );

    constructor(
        private readonly prisma: PrismaService,
        private readonly stellar: StellarService,
        private readonly tier: TierService,
        private distributorQueue: DistributorQueueService,
    ) { }

    async onModuleInit() {
        // Start staking loop
        this.runStakingLoop().catch((error) => {
            this.logger.error(`Staking loop error: ${error.message}`);
        });

        // Start holders update loop
        this.runHoldersLoop().catch((error) => {
            this.logger.error(`Holders loop error: ${error.message}`);
        });

        // Start prices update loop
        this.runPricesLoop().catch((error) => {
            this.logger.error(`Prices loop error: ${error.message}`);
        });
    }

    async parseHolders(asset: Asset): Promise<Record<string, number>> {
        try {
            return await this.stellar.parseHolders(asset);
        } catch (error) {
            this.logger.error(`Can't parse ${asset.getCode()}: ${error.message}`);
            return {};
        }
    }

    async updateHolders(): Promise<void> {
        try {
            const wallets = await this.prisma.wallet.findMany({
                where: { isActive: true },
            });

            const walletHolders: Record<string, any> = {};

            // Get balance directly for each known wallet
            for (const wallet of wallets) {
                const walletPublicKey = wallet.publicKey;

                try {
                    const balance = await this.stellar.getBalance(walletPublicKey, this.MAIN_ASSET);
                    walletHolders[walletPublicKey] = balance;
                    this.logger.log(`Wallet ${walletPublicKey}: ${balance} NWO`);
                } catch (error) {
                    this.logger.warn(`Failed to get balance for ${walletPublicKey}: ${error.message}`);
                    walletHolders[walletPublicKey] = wallet.balance || 0;
                }
            }

            this.logger.log(`Updated balances for ${Object.keys(walletHolders).length} wallets`);

            // Store holders data in settings
            await this.prisma.settings.upsert({
                where: { id: 1 },
                create: {
                    mainTokenHolders: walletHolders,
                },
                update: {
                    mainTokenHolders: walletHolders,
                },
            });
        } catch (error) {
            this.logger.error(`Unexpected error while updating holders: ${error.message}`);
        }
    }

    async calculateRewards(): Promise<void> {
        this.logger.log('Staking task started...');

        const rewardsToSend: Array<{ destination: string; asset: Asset; amount: number }> = [];

        try {
            const now = Date.now() / 1000; // timestamp in seconds
            const stakingAssets = await this.prisma.stakingAsset.findMany();
            const wallets = await this.prisma.wallet.findMany({
                where: { isActive: true },
            });

            const settings = await this.prisma.settings.findFirst();
            const mainAssetHolders = (settings?.mainTokenHolders as Record<string, number>) || {};

            // Get balances directly for each staking asset
            const assetHoldersMap = new Map<number, Record<string, number>>();
            for (const stakingAsset of stakingAssets) {
                const asset = new Asset(stakingAsset.assetCode, stakingAsset.assetIssuer);
                const holders: Record<string, number> = {};

                // Get balance for each active wallet
                for (const wallet of wallets) {
                    try {
                        const balance = await this.stellar.getBalance(wallet.publicKey, asset);
                        if (balance > 0) {
                            holders[wallet.publicKey] = balance;
                        }
                    } catch (error) {
                        this.logger.warn(`Failed to get ${stakingAsset.assetCode} balance for ${wallet.publicKey}`);
                    }
                }

                assetHoldersMap.set(stakingAsset.id, holders);
                this.logger.log(`${stakingAsset.assetCode}: ${Object.keys(holders).length} wallets with balance`);
            }

            for (const wallet of wallets) {
                try {
                    const walletPublicKey = wallet.publicKey;

                    // Get wallet balance from main asset holders
                    const walletBalance = mainAssetHolders[walletPublicKey] || wallet.balance || 0;
                    this.logger.log(`w-${walletPublicKey}: MAIN_ASSET balance: ${walletBalance}`);

                    // Parse existing rewards
                    let rewards: RewardData[] = [];
                    try {
                        const rewardsData = wallet.rewards;
                        if (Array.isArray(rewardsData)) {
                            rewards = rewardsData as unknown as RewardData[];
                        } else if (typeof rewardsData === 'string') {
                            rewards = JSON.parse(rewardsData) as RewardData[];
                        }
                    } catch (error) {
                        this.logger.error(`Invalid rewards data for wallet ${walletPublicKey}`);
                        rewards = [];
                    }

                    const updatedRewards: RewardData[] = [];

                    for (const stakingAsset of stakingAssets) {
                        const rewardAsset = this.getRewardAsset({
                            asset_name: stakingAsset.assetCode,
                            asset_issuer: stakingAsset.assetIssuer,
                        } as RewardData);

                        const existingReward = rewards.find(
                            (r) =>
                                r.asset_name === stakingAsset.assetCode &&
                                r.asset_issuer === stakingAsset.assetIssuer,
                        );

                        // Get wallet percent from tier
                        const walletPercent = this.tier.getPercent(
                            stakingAsset.tier as any,
                            walletBalance,
                        );

                        const holders = assetHoldersMap.get(stakingAsset.id) || {};
                        const balance = holders[walletPublicKey] || existingReward?.balance || 0;

                        const newReward = this.createRewardFromStakingAsset(
                            stakingAsset,
                            walletPercent,
                            balance,
                            0,
                            0,
                        );

                        if (walletPercent > 0 && balance > 0) {
                            newReward.earned = existingReward?.earned || 0;
                            newReward.last_update_timestamp = existingReward?.last_update_timestamp || 0;

                            // FOR TESTING: Reward every 30 seconds instead of hourly
                            const TEST_MODE = true;
                            const REWARD_INTERVAL_SECONDS = TEST_MODE ? 30 : 3600; // 30 sec for test, 1 hour for prod

                            // Initialize timestamp if this is first time
                            if (newReward.last_update_timestamp === 0) {
                                newReward.last_update_timestamp = now;
                                this.logger.log(`w-${walletPublicKey}:a-#${stakingAsset.id}: Initialized timestamp`);
                            } else if (now - newReward.last_update_timestamp >= REWARD_INTERVAL_SECONDS && walletBalance > 0) {
                                const timeDeltaHours = (now - newReward.last_update_timestamp) / 3600;
                                const earned = walletBalance * (walletPercent / 100) * timeDeltaHours;
                                newReward.earned += earned;
                                newReward.last_update_timestamp = now;

                                this.logger.log(
                                    `w-${walletPublicKey}:a-#${stakingAsset.id}: ` +
                                    `Rewarded ${earned.toFixed(7)} (total: ${newReward.earned.toFixed(7)})`,
                                );

                                // Add reward to send queue
                                rewardsToSend.push({
                                    destination: walletPublicKey,
                                    asset: rewardAsset,
                                    amount: parseFloat(earned.toFixed(7)),
                                });
                            }
                        }

                        updatedRewards.push(newReward);
                    }

                    // Update wallet rewards and balance
                    await this.prisma.wallet.update({
                        where: { id: wallet.id },
                        data: {
                            rewards: updatedRewards as any,
                            balance: walletBalance,
                        },
                    });
                } catch (error) {
                    this.logger.error(
                        `w-${wallet.publicKey}: Unexpected error while checking the wallet: ${error.message}`,
                    );
                    continue;
                }
            }

            // Send rewards if any
            if (rewardsToSend.length > 0) {
                const sendingEnabled = settings?.sendingEnabled || false;

                if (sendingEnabled) {
                    await this.distributorQueue.append(rewardsToSend, undefined, 'staking-rewards');
                    this.logger.log(`Appended ${rewardsToSend.length} rewards to distributors queue`);
                } else {
                    this.logger.log(
                        `Skipped sending ${rewardsToSend.length} rewards as sending is disabled`,
                    );
                }
            }
        } catch (error) {
            this.logger.error(`Error in staking task: ${error.message}`);
        }

        this.logger.log('Staking task finished...');
    }

    async updatePrices(): Promise<void> {
        this.logger.log('Prices task running...');

        const stakingAssets = await this.prisma.stakingAsset.findMany();

        for (const stakingAsset of stakingAssets) {
            try {
                const asset = new Asset(stakingAsset.assetCode, stakingAsset.assetIssuer);
                const assetInfo = await this.stellar.assetInfo(asset);

                if (assetInfo) {
                    const assetOldPrice = stakingAsset.price;
                    const assetNewPrice = assetInfo.price || 0;
                    const assetPrice = assetNewPrice > 0 ? assetNewPrice : assetOldPrice;

                    await this.prisma.stakingAsset.update({
                        where: { id: stakingAsset.id },
                        data: {
                            price: assetPrice,
                        },
                    });

                    this.logger.log(`${stakingAsset.assetCode} price updated to ${assetPrice}`);
                }
            } catch (error) {
                this.logger.error(
                    `Error fetching price for ${stakingAsset.assetCode}: ${error.message}`,
                );
            }
        }
    }

    private getRewardAsset(reward: Partial<RewardData>): Asset {
        const code = reward.asset_name!;
        const issuer = reward.asset_issuer;

        if (issuer && issuer !== 'native') {
            return new Asset(code, issuer);
        } else {
            return Asset.native();
        }
    }

    private createRewardFromStakingAsset(
        stakingAsset: any,
        hourlyPercent: number = 0,
        balance: number = 0,
        earned: number = 0,
        lastUpdateTimestamp: number = 0,
    ): RewardData {
        return {
            asset_id: stakingAsset.id,
            asset_name: stakingAsset.assetCode,
            asset_issuer: stakingAsset.assetIssuer,
            balance,
            earned,
            hourly_percent: hourlyPercent,
            last_update_timestamp: lastUpdateTimestamp,
            usd_price: stakingAsset.price,
            icon: '',
            domain: '',
            is_premium: stakingAsset.premium > 0,
        };
    }

    // Method to run periodic staking calculations
    async runStakingLoop(): Promise<void> {
        while (true) {
            await this.calculateRewards();
            await new Promise((resolve) => setTimeout(resolve, this.TASK_INTERVAL * 1000));
        }
    }

    // Method to run periodic holders updates
    async runHoldersLoop(): Promise<void> {
        while (true) {
            await this.updateHolders();
            await new Promise((resolve) => setTimeout(resolve, 60 * 1000)); // Every minute
        }
    }

    // Method to run periodic price updates
    async runPricesLoop(): Promise<void> {
        while (true) {
            await this.updatePrices();
            await new Promise((resolve) => setTimeout(resolve, 30 * 60 * 1000)); // Every 30 minutes
        }
    }
}
