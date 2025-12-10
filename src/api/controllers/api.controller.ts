import {
    Controller,
    Post,
    Body,
    HttpException,
    HttpStatus,
    ValidationPipe,
} from '@nestjs/common';
import { TelegramAuthService } from '../services/telegram-auth.service';
import { UserService } from '../services/user.service';
import { WalletService } from '../services/wallet.service';
import { BillingService } from '../services/billing.service';
import { PurchaseService } from '../services/purchase.service';
import { SwapService } from '../services/swap.service';
import { UserStatisticsDto } from '../dto/user-statistics.dto';
import { AddWalletDto, VerifyWalletDto, DeleteWalletDto } from '../dto/wallet.dto';
import { DepositCardDto, WithdrawCardDto } from '../dto/card.dto';
import { AddBillingDetailsDto } from '../dto/billing.dto';
import { CreatePurchaseDto } from '../dto/purchase.dto';
import { SwapDto } from '../dto/swap.dto';
import { PrismaService } from '../../database/prisma.service';

@Controller()
export class ApiController {
    private readonly isDev: boolean;

    constructor(
        private readonly prisma: PrismaService,
        private readonly telegramAuth: TelegramAuthService,
        private readonly userService: UserService,
        private readonly walletService: WalletService,
        private readonly billingService: BillingService,
        private readonly purchaseService: PurchaseService,
        private readonly swapService: SwapService,
    ) {
        this.isDev = process.env.IS_DEV === 'true';
    }

    private async validateAndGetUser(initData?: string) {
        // Dev mode: return mock user if initData is not provided
        if (this.isDev && (!initData || initData.trim() === '')) {
            let mockUser = await this.prisma.user.findFirst({
                where: { telegramId: BigInt(999999999) },
            });

            if (!mockUser) {
                mockUser = await this.prisma.user.create({
                    data: {
                        telegramId: BigInt(999999999),
                        telegramUsername: 'mock_user',
                        telegramName: 'Mock User',
                    },
                });
            }

            return mockUser;
        }

        if (!initData) {
            throw new HttpException('Invalid authentication', HttpStatus.UNAUTHORIZED);
        }

        const telegramUser = this.telegramAuth.validateInitData(initData);

        if (!telegramUser) {
            throw new HttpException('Invalid authentication', HttpStatus.UNAUTHORIZED);
        }

        const user = await this.prisma.user.findUnique({
            where: { telegramId: telegramUser.id },
        });

        if (!user) {
            throw new HttpException('User not found', HttpStatus.NOT_FOUND);
        }

        return user;
    }

    @Post('/userStatistics')
    async userStatistics(@Body(ValidationPipe) body: UserStatisticsDto) {
        const user = await this.validateAndGetUser(body.initData);
        return this.userService.getUserStatistics(user.id);
    }

    @Post('/addWallet')
    async addWallet(@Body(ValidationPipe) body: AddWalletDto) {
        const user = await this.validateAndGetUser(body.initData);
        return this.walletService.addWallet(user.id, body.publicKey);
    }

    @Post('/verifyWallet')
    async verifyWallet(@Body(ValidationPipe) body: VerifyWalletDto) {
        const user = await this.validateAndGetUser(body.initData);
        return this.walletService.verifyWallet(user.id, body.walletId);
    }

    @Post('/deleteWallet')
    async deleteWallet(@Body(ValidationPipe) body: DeleteWalletDto) {
        const user = await this.validateAndGetUser(body.initData);
        return this.walletService.deleteWallet(user.id, body.walletId);
    }

    @Post('/depositCard')
    async depositCard(@Body(ValidationPipe) body: DepositCardDto) {
        const user = await this.validateAndGetUser(body.initData);
        return this.userService.depositToCard(user.id, body.amount);
    }

    @Post('/withdrawCard')
    async withdrawCard(@Body(ValidationPipe) body: WithdrawCardDto) {
        const user = await this.validateAndGetUser(body.initData);
        return this.userService.withdrawFromCard(user.id, body.amount);
    }

    @Post('/addBillingDetails')
    async addBillingDetails(@Body(ValidationPipe) body: AddBillingDetailsDto) {
        const user = await this.validateAndGetUser(body.initData);
        return this.billingService.addOrUpdateBillingDetails(
            user.id,
            body.fullName,
            body.address,
            body.city,
            body.country,
            body.zipCode,
        );
    }

    @Post('/createPurchase')
    async createPurchase(@Body(ValidationPipe) body: CreatePurchaseDto) {
        const user = await this.validateAndGetUser(body.initData);
        return this.purchaseService.createPurchase(user.id, body.companyId, body.amount);
    }

    @Post('/swap')
    async swap(@Body(ValidationPipe) body: SwapDto) {
        const user = await this.validateAndGetUser(body.initData);
        return this.swapService.swap(user.id, body.fromAsset, body.toAsset, body.amount);
    }
}
