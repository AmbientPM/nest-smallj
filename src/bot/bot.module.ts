import { Module, OnModuleInit } from '@nestjs/common';
import { TelegrafModule } from 'nestjs-telegraf';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { session } from 'telegraf';
import { Telegraf } from 'telegraf';
import { InjectBot } from 'nestjs-telegraf';

import { MenuUpdate } from './updates/menu.update';
import { TextHandlerUpdate } from './updates/text-handler.update';
import { AdminStakingUpdate } from './updates/admin/staking.update';
import { AdminDistributorsUpdate } from './updates/admin/distributors.update';
import { AdminCompaniesUpdate } from './updates/admin/companies.update';
import { AdminLiquidityUpdate } from './updates/admin/liquidity.update';
import { AdminStakingAssetsUpdate } from './updates/admin/staking-assets.update';
import { AdminRewardsTierUpdate } from './updates/admin/rewards-tier.update';
import { AdminSwapTierUpdate } from './updates/admin/swap-tier.update';
import { AdminRaiseTierPercentUpdate } from './updates/admin/raise-tier-percent.update';
import { AdminWelcomeImageUpdate } from './updates/admin/welcome-image.update';

import { IsAdminGuard } from './guards/is-admin.guard';
import { IsPrivateGuard } from './guards/is-private.guard';
import { UserMiddleware } from './middlewares/user.middleware';
import { ActionLoggingMiddleware } from './middlewares/action-logging.middleware';

@Module({
    imports: [
        TelegrafModule.forRootAsync({
            imports: [ConfigModule],
            useFactory: async (configService: ConfigService) => ({
                token: configService.get<string>('BOT_TOKEN')!,
                middlewares: [session()],
            }),
            inject: [ConfigService],
        }),
    ],
    providers: [
        MenuUpdate,
        TextHandlerUpdate,
        AdminSwapTierUpdate,
        AdminRewardsTierUpdate,
        AdminRaiseTierPercentUpdate,
        AdminStakingUpdate,
        AdminDistributorsUpdate,
        AdminCompaniesUpdate,
        AdminLiquidityUpdate,
        AdminStakingAssetsUpdate,
        AdminWelcomeImageUpdate,
        IsAdminGuard,
        IsPrivateGuard,
        UserMiddleware,
        ActionLoggingMiddleware,
    ],
})
export class BotModule implements OnModuleInit {
    constructor(
        @InjectBot() private readonly bot: Telegraf,
        private readonly userMiddleware: UserMiddleware,
        private readonly actionLoggingMiddleware: ActionLoggingMiddleware,
    ) { }

    onModuleInit() {
        // Register custom middlewares
        this.bot.use((ctx, next) => this.userMiddleware.use(ctx as any, next));
        this.bot.use((ctx, next) => this.actionLoggingMiddleware.use(ctx as any, next));

        // Add error handler
        this.bot.catch((err, ctx) => {
            console.error(`Error for ${ctx.updateType}:`, err);
        });

        console.log('Bot initialized successfully');
    }
}
