import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { BotModule } from './bot/bot.module';
import { ApiModule } from './api/api.module';
import { BlockchainModule } from './blockchain/blockchain.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DatabaseModule,
    BotModule,
    ApiModule,
    BlockchainModule,
  ],
})
export class AppModule { }
