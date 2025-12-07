import { IsNotEmpty, IsString, IsNumber, IsOptional } from 'class-validator';

export class SwapDto {
    @IsOptional()
    @IsString()
    initData?: string;

    @IsNotEmpty()
    @IsString()
    fromAsset: string;

    @IsNotEmpty()
    @IsString()
    toAsset: string;

    @IsNotEmpty()
    @IsNumber()
    amount: number;
}
