import { IsOptional, IsString } from 'class-validator';

export class UserStatisticsDto {
    @IsOptional()
    @IsString()
    initData?: string;
}

export class UserStatisticsResponseDto {
    wallets: any[];
    balance: number;
    statistics: any;
    settings: {
        swapTier: any;
        rewardsTier: any;
        xrpNwoPrice: number | null;
        xrpDepositAddress: string | null;
    };
}
