import { IsNotEmpty, IsString, IsNumber, IsOptional } from 'class-validator';

export class AddWalletDto {
    @IsOptional()
    @IsString()
    initData?: string;

    @IsNotEmpty()
    @IsString()
    publicKey: string;
}

export class DeleteWalletDto {
    @IsOptional()
    @IsString()
    initData?: string;

    @IsNotEmpty()
    @IsNumber()
    walletId: number;
}
