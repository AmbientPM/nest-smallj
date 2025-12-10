import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { StellarService } from '../../blockchain/services/stellar.service';
import { Asset } from 'stellar-sdk';

@Injectable()
export class WalletService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly stellar: StellarService,
    ) { }

    /**
     * Шаг 1: Начинаем процесс добавления кошелька
     * Генерируем уникальный код для проверки
     */
    async addWallet(userId: number, publicKey: string) {
        // Проверяем существует ли кошелёк в блокчейне
        const exists = await this.stellar.checkPublicKey(publicKey);
        if (!exists) {
            throw new HttpException(
                'Wallet does not exist in blockchain',
                HttpStatus.BAD_REQUEST,
            );
        }

        // Проверяем не добавлен ли уже
        const existingWallet = await this.prisma.wallet.findUnique({
            where: { publicKey },
        });

        if (existingWallet) {
            throw new HttpException('Wallet already exists', HttpStatus.BAD_REQUEST);
        }

        // Генерируем уникальный verification код
        const verificationCode = this.generateVerificationCode();

        // Получаем адрес для отправки из настроек
        const settings = await this.prisma.settings.findFirst();
        const depositAddress = settings?.depositAddress;

        if (!depositAddress) {
            throw new HttpException(
                'Deposit address not configured',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }

        // Создаём временную запись (неактивную) с кодом
        const wallet = await this.prisma.wallet.create({
            data: {
                userId,
                publicKey,
                balance: 0,
                isActive: false, // ❗ Неактивный пока не подтверждён
                rewards: {
                    verificationCode, // Сохраняем код
                    verified: false,
                },
            },
        });

        return {
            success: true,
            needsVerification: true,
            verificationCode,
            depositAddress, // Куда отправлять
            minAmount: 1, // Минимальная сумма XLM
            message: `Send at least 1 XLM to ${depositAddress} with memo: ${verificationCode}`,
            wallet: {
                id: wallet.id,
                publicKey: wallet.publicKey,
            },
        };
    }

    /**
     * Шаг 2: Проверяем получили ли платёж с правильным memo
     */
    async verifyWallet(userId: number, walletId: number) {
        const wallet = await this.prisma.wallet.findFirst({
            where: {
                id: walletId,
                userId,
                isActive: false, // Только неподтверждённые
            },
        });

        if (!wallet) {
            throw new HttpException('Wallet not found', HttpStatus.NOT_FOUND);
        }

        const rewards = wallet.rewards as any;
        const verificationCode = rewards?.verificationCode;

        if (!verificationCode) {
            throw new HttpException(
                'Verification code not found',
                HttpStatus.BAD_REQUEST,
            );
        }

        // Получаем адрес получателя из настроек
        const settings = await this.prisma.settings.findFirst();
        const depositAddress = settings?.depositAddress;

        if (!depositAddress) {
            throw new HttpException(
                'Deposit address not configured',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }

        // Проверяем блокчейн: пришли ли деньги с правильным memo
        const received = await this.stellar.receive(
            wallet.publicKey, // От кого ждём
            depositAddress, // Куда должны прийти
            Asset.native(), // XLM (нативная валюта)
            verificationCode, // Проверяем memo
            1, // Минимум 1 XLM
        );

        if (!received) {
            return {
                success: false,
                verified: false,
                message: 'Payment not received yet. Please send 1 XLM with the verification code.',
            };
        }

        // ✅ Платёж получен! Активируем кошелёк
        await this.prisma.wallet.update({
            where: { id: walletId },
            data: {
                isActive: true,
                rewards: {
                    verificationCode,
                    verified: true,
                    verifiedAt: new Date().toISOString(),
                },
            },
        });

        return {
            success: true,
            verified: true,
            message: 'Wallet verified successfully! Staking rewards will start accumulating.',
        };
    }

    /**
     * Генерирует случайный код для проверки
     */
    private generateVerificationCode(): string {
        const timestamp = Date.now().toString().slice(-6);
        const random = Math.floor(Math.random() * 1000)
            .toString()
            .padStart(3, '0');
        return `NWO${timestamp}${random}`;
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
