import { IsNotEmpty, IsString, IsNumber, IsOptional } from 'class-validator';

export class DepositCardDto {
    @IsOptional()
    @IsString()
    initData?: string;

    @IsNotEmpty()
    @IsNumber()
    amount: number;
}

export class WithdrawCardDto {
    @IsOptional()
    @IsString()
    initData?: string;

    @IsNotEmpty()
    @IsNumber()
    amount: number;
}
