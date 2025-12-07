import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class WalletService {
    constructor(private readonly prisma: PrismaService) { }

    async addWallet(userId: number, publicKey: string) {
        // Check if wallet already exists
        const existingWallet = await this.prisma.wallet.findUnique({
            where: { publicKey },
        });

        if (existingWallet) {
            throw new HttpException('Wallet already exists', HttpStatus.BAD_REQUEST);
        }

        const wallet = await this.prisma.wallet.create({
            data: {
                userId,
                publicKey,
                balance: 0,
                isActive: true,
            },
        });

        return {
            success: true,
            wallet,
        };
    }

    async deleteWallet(userId: number, walletId: number) {
        const wallet = await this.prisma.wallet.findFirst({
            where: {
                id: walletId,
                userId,
            },
        });

        if (!wallet) {
            throw new HttpException('Wallet not found', HttpStatus.NOT_FOUND);
        }

        await this.prisma.wallet.update({
            where: { id: walletId },
            data: { isActive: false },
        });

        return {
            success: true,
            message: 'Wallet deleted successfully',
        };
    }
}
