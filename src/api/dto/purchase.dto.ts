import { IsNotEmpty, IsString, IsNumber, IsOptional } from 'class-validator';

export class CreatePurchaseDto {
    @IsOptional()
    @IsString()
    initData?: string;

    @IsNotEmpty()
    @IsNumber()
    companyId: number;

    @IsNotEmpty()
    @IsNumber()
    amount: number;
}
