import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class AddBillingDetailsDto {
    @IsOptional()
    @IsString()
    initData?: string;

    @IsNotEmpty()
    @IsString()
    fullName: string;

    @IsNotEmpty()
    @IsString()
    address: string;

    @IsNotEmpty()
    @IsString()
    city: string;

    @IsNotEmpty()
    @IsString()
    country: string;

    @IsNotEmpty()
    @IsString()
    zipCode: string;
}
