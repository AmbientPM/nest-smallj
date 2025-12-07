import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class BillingService {
    constructor(private readonly prisma: PrismaService) { }

    async addOrUpdateBillingDetails(
        userId: number,
        fullName: string,
        address: string,
        city: string,
        country: string,
        zipCode: string,
    ) {
        const billingDetails = await this.prisma.billingDetails.upsert({
            where: { userId },
            create: {
                userId,
                fullName,
                address,
                city,
                country,
                zipCode,
            },
            update: {
                fullName,
                address,
                city,
                country,
                zipCode,
            },
        });

        return {
            success: true,
            billingDetails,
        };
    }
}
