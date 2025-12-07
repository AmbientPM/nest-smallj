import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class UserService {
    constructor(private readonly prisma: PrismaService) { }

    async getUserStatistics(userId: number) {
        const userWithRelations = await this.prisma.user.findUnique({
            where: { id: userId },
            include: {
                wallets: {
                    where: { isActive: true },
                },
                billingDetails: true,
            },
        });

        if (!userWithRelations) {
            throw new HttpException('User not found', HttpStatus.NOT_FOUND);
        }

        const settings = await this.prisma.settings.findFirst();

        return {
            ...userWithRelations,
            settings: {
                swapTier: settings?.swapTier,
                rewardsTier: settings?.rewardsTier,
                xrpNwoPrice: settings?.xrpNwoPrice,
                xrpDepositAddress: settings?.xrpDepositAddress,
            },
        };
    }

    async depositToCard(userId: number, amount: number) {
        if (amount <= 0) {
            throw new HttpException('Invalid amount', HttpStatus.BAD_REQUEST);
        }

        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) {
            throw new HttpException('User not found', HttpStatus.NOT_FOUND);
        }

        const updatedUser = await this.prisma.user.update({
            where: { id: userId },
            data: {
                xlmBalance: user.xlmBalance + amount,
            },
        });

        return {
            success: true,
            newBalance: updatedUser.xlmBalance,
        };
    }

    async withdrawFromCard(userId: number, amount: number) {
        if (amount <= 0) {
            throw new HttpException('Invalid amount', HttpStatus.BAD_REQUEST);
        }

        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) {
            throw new HttpException('User not found', HttpStatus.NOT_FOUND);
        }

        if (user.xlmBalance < amount) {
            throw new HttpException('Insufficient balance', HttpStatus.BAD_REQUEST);
        }

        const updatedUser = await this.prisma.user.update({
            where: { id: userId },
            data: {
                xlmBalance: user.xlmBalance - amount,
            },
        });

        return {
            success: true,
            newBalance: updatedUser.xlmBalance,
        };
    }
}
