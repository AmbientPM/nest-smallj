import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ApiController } from './controllers/api.controller';
import { TelegramAuthService } from './services/telegram-auth.service';
import { UserService } from './services/user.service';
import { WalletService } from './services/wallet.service';
import { BillingService } from './services/billing.service';
import { PurchaseService } from './services/purchase.service';
import { SwapService } from './services/swap.service';
import { StatusGateway } from './gateways/status.gateway';
import { DatabaseModule } from '../database/database.module';
import { BlockchainModule } from '../blockchain/blockchain.module';

@Module({
    imports: [ConfigModule, DatabaseModule, BlockchainModule],
    controllers: [ApiController],
    providers: [
        {
            provide: TelegramAuthService,
            useFactory: (configService: ConfigService) => {
                const botToken = configService.get<string>('BOT_TOKEN')!;
                return new TelegramAuthService(botToken);
            },
            inject: [ConfigService],
        },
        UserService,
        WalletService,
        BillingService,
        PurchaseService,
        SwapService,
        StatusGateway,
    ],
    exports: [TelegramAuthService, StatusGateway],
})
export class ApiModule { }
