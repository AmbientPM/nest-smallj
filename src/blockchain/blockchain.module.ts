import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StellarService } from './services/stellar.service';
import { XRPService } from './services/xrp.service';
import { TierService } from './services/tier.service';
import { StakingService } from './services/staking.service';
import { DistributorQueueService } from './services/distributor-queue.service';
import { DatabaseModule } from '../database/database.module';

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
