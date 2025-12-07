import { Update, Ctx, On, Action } from 'nestjs-telegraf';
import { UseGuards, Logger } from '@nestjs/common';
import type { Context } from '../../interfaces/context.interface';
import { IsPrivateGuard } from '../../guards/is-private.guard';
import { IsAdminGuard } from '../../guards/is-admin.guard';
import { PrismaService } from '../../../database/prisma.service';
import { cancelKeyboard, adminStakingKeyboard, backToStakingKeyboard } from '../../keyboards/keyboards';
import { getStakingInfo } from '../../utils/messages';
import { MessageManager } from '../../utils/message-manager';

@Update()
@UseGuards(IsPrivateGuard, IsAdminGuard)
export class AdminStakingUpdate {
    private readonly logger = new Logger(AdminStakingUpdate.name);

    constructor(private readonly prisma: PrismaService) { }

    private async sendSuccess(ctx: Context, message: string) {
        await MessageManager.deleteRemembered(ctx);
        try {
            await ctx.deleteMessage();
        } catch (e) { }
        ctx.session = {};
        await ctx.reply(`✅ ${message}`, backToStakingKeyboard);
    }

    @Action('menu')
    async stakingMenu(@Ctx() ctx: Context) {
        this.logger.log('Menu action triggered');
        await MessageManager.clearSessionAndMessages(ctx);
        const info = await getStakingInfo(this.prisma);
        await MessageManager.editOrSend(ctx, info, {
            parse_mode: 'HTML',
            ...adminStakingKeyboard,
        });
    }

    @Action('staking_deposits')
    async showDepositSettings(@Ctx() ctx: Context) {
        const settings = await this.prisma.settings.findFirst();
        const text = `<b>💰 Deposit Settings</b>\n\n` +
            `<b>XLM Deposit Address:</b>\n<code>${settings?.depositAddress || 'Not set'}</code>\n\n` +
            `<b>XLM Deposit Amount:</b> ${settings?.depositAmount || 'Not set'}\n\n` +
            `<b>XRP Deposit Address:</b>\n<code>${settings?.xrpDepositAddress || 'Not set'}</code>\n\n` +
            `<b>XRP/NWO Price:</b> ${settings?.xrpNwoPrice || 'Not set'}`;

        const { adminDepositSettingsKeyboard } = await import('../../keyboards/keyboards.js');
        await MessageManager.editOrSend(ctx, text, {
            parse_mode: 'HTML',
            ...adminDepositSettingsKeyboard,
        });
    }

    @Action('staking_keys')
    async showKeysSettings(@Ctx() ctx: Context) {
        const settings = await this.prisma.settings.findFirst();
        const text = `<b>🔑 Issuer & Keys Settings</b>\n\n` +
            `<b>Issuer Public:</b>\n<code>${settings?.issuerPublic ? settings.issuerPublic.substring(0, 20) + '...' : 'Not set'}</code>\n\n` +
            `<b>Sending Enabled:</b> ${settings?.sendingEnabled ? '✅' : '❌'}\n\n` +
            `<b>Purchase Distributor:</b> ${settings?.purchaseDistributorSecret ? '✅ Set' : '❌ Not set'}`;

        const { adminKeysKeyboard } = await import('../../keyboards/keyboards.js');
        await MessageManager.editOrSend(ctx, text, {
            parse_mode: 'HTML',
            ...adminKeysKeyboard,
        });
    }

    @Action('tier_management')
    async showTierManagement(@Ctx() ctx: Context) {
        const text = `<b>📈 Tier Management</b>\n\nManage staking tiers, rewards, and swap rates.`;

        const { adminTierManagementKeyboard } = await import('../../keyboards/keyboards.js');
        await MessageManager.editOrSend(ctx, text, {
            parse_mode: 'HTML',
            ...adminTierManagementKeyboard,
        });
    }

    @Action('staking_set:xrp_deposit_address')
    async setXrpDepositAddress(@Ctx() ctx: Context) {
        ctx.session.step = 'xrp_deposit_address';
        await MessageManager.sendAndRemember(ctx, '💬 Enter new XRP deposit address:', cancelKeyboard);
        await ctx.answerCbQuery();
    }

    @Action('staking_set:xrp_nwo_price')
    async setXrpNwoPrice(@Ctx() ctx: Context) {
        ctx.session.step = 'xrp_nwo_price';
        await MessageManager.sendAndRemember(ctx, '💬 Enter new XRP/NWO price:', cancelKeyboard);
        await ctx.answerCbQuery();
    }

    @Action('staking_set:deposit_address')
    async setDepositAddress(@Ctx() ctx: Context) {
        ctx.session.step = 'deposit_address';
        await MessageManager.sendAndRemember(ctx, '💬 Enter new XLM deposit address:', cancelKeyboard);
        await ctx.answerCbQuery();
    }

    @Action('staking_set:deposit_amount')
    async setDepositAmount(@Ctx() ctx: Context) {
        ctx.session.step = 'deposit_amount';
        await MessageManager.sendAndRemember(ctx, '💬 Enter new XLM deposit amount:', cancelKeyboard);
        await ctx.answerCbQuery();
    }

    @Action('staking_set:issuer_keys')
    async setIssuerKeys(@Ctx() ctx: Context) {
        ctx.session.step = 'issuer_secret';
        await MessageManager.sendAndRemember(ctx, '🔑 Enter issuer secret key:', cancelKeyboard);
        await ctx.answerCbQuery();
    } @Action('staking_set:toggle_sending')
    async toggleSending(@Ctx() ctx: Context) {
        const settings = await this.prisma.settings.findFirst();

        if (settings) {
            await this.prisma.settings.update({
                where: { id: settings.id },
                data: { sendingEnabled: !settings.sendingEnabled },
            });

            await ctx.answerCbQuery(
                `Sending ${!settings.sendingEnabled ? 'enabled' : 'disabled'}`,
            );

            const info = await getStakingInfo(this.prisma);
            await ctx.reply(info, {
                parse_mode: 'HTML',
                ...adminStakingKeyboard,
            });
        } else {
            await ctx.answerCbQuery('Settings not found', { show_alert: true });
        }
    }

    @Action('set_purchase_distributor_secret')
    async setPurchaseDistributorSecret(@Ctx() ctx: Context) {
        ctx.session.step = 'purchase_distributor_secret';
        await MessageManager.sendAndRemember(ctx, '🔑 Enter purchase distributor secret:', cancelKeyboard);
        await ctx.answerCbQuery();
    }

    async handleTextInput(@Ctx() ctx: Context) {
        console.log('[Staking] Text received, session:', ctx.session);
        console.log('[Staking] Session step:', ctx.session.step);

        const validSteps = ['xrp_deposit_address', 'xrp_nwo_price', 'deposit_address', 'deposit_amount', 'issuer_secret', 'purchase_distributor_secret'];
        if (!ctx.session.step || !validSteps.includes(ctx.session.step)) {
            console.log('[Staking] Step mismatch, returning');
            return;
        }

        console.log('[Staking] Processing staking input');

        const text = (ctx.message as any).text;

        try {
            switch (ctx.session.step) {
                case 'xrp_deposit_address':
                    await this.handleXrpDepositAddress(ctx, text);
                    break;

                case 'xrp_nwo_price':
                    await this.handleXrpNwoPrice(ctx, text);
                    break;

                case 'deposit_address':
                    await this.handleDepositAddress(ctx, text);
                    break;

                case 'deposit_amount':
                    await this.handleDepositAmount(ctx, text);
                    break;

                case 'issuer_secret':
                    await this.handleIssuerSecret(ctx, text);
                    break;

                case 'purchase_distributor_secret':
                    await this.handlePurchaseDistributorSecret(ctx, text);
                    break;
            }
        } catch (error) {
            await ctx.reply(
                error instanceof Error ? error.message : 'An error occurred',
                cancelKeyboard,
            );
        }
    }

    private async handleXrpDepositAddress(ctx: Context, address: string) {
        let settings = await this.prisma.settings.findFirst();

        if (!settings) {
            settings = await this.prisma.settings.create({
                data: { xrpDepositAddress: address },
            });
        } else {
            await this.prisma.settings.update({
                where: { id: settings.id },
                data: { xrpDepositAddress: address },
            });
        }

        await this.sendSuccess(ctx, 'XRP deposit address updated!');
    }

    private async handleXrpNwoPrice(ctx: Context, priceStr: string) {
        const price = parseFloat(priceStr);

        if (isNaN(price)) {
            throw new Error('Price must be a number');
        }

        let settings = await this.prisma.settings.findFirst();

        if (!settings) {
            settings = await this.prisma.settings.create({
                data: { xrpNwoPrice: price },
            });
        } else {
            await this.prisma.settings.update({
                where: { id: settings.id },
                data: { xrpNwoPrice: price },
            });
        }

        await this.sendSuccess(ctx, 'XRP/NWO price updated!');
    }

    private async handleDepositAddress(ctx: Context, address: string) {
        let settings = await this.prisma.settings.findFirst();

        if (!settings) {
            settings = await this.prisma.settings.create({
                data: { depositAddress: address },
            });
        } else {
            await this.prisma.settings.update({
                where: { id: settings.id },
                data: { depositAddress: address },
            });
        }

        await this.sendSuccess(ctx, 'Deposit address updated!');
    }

    private async handleDepositAmount(ctx: Context, amountStr: string) {
        const amount = parseFloat(amountStr);

        if (isNaN(amount)) {
            throw new Error('Amount must be a number');
        }

        let settings = await this.prisma.settings.findFirst();

        if (!settings) {
            settings = await this.prisma.settings.create({
                data: { depositAmount: amount },
            });
        } else {
            await this.prisma.settings.update({
                where: { id: settings.id },
                data: { depositAmount: amount },
            });
        }

        await this.sendSuccess(ctx, 'Deposit amount updated!');
    }

    private async handleIssuerSecret(ctx: Context, secret: string) {
        // TODO: Validate secret key with Stellar SDK
        // For now, just save it

        let settings = await this.prisma.settings.findFirst();

        if (!settings) {
            settings = await this.prisma.settings.create({
                data: { issuerSecret: secret },
            });
        } else {
            await this.prisma.settings.update({
                where: { id: settings.id },
                data: { issuerSecret: secret },
            });
        }

        await this.sendSuccess(ctx, 'Issuer secret updated!');
    }

    private async handlePurchaseDistributorSecret(ctx: Context, secret: string) {
        // TODO: Validate secret key and get public key

        let settings = await this.prisma.settings.findFirst();

        if (!settings) {
            settings = await this.prisma.settings.create({
                data: { purchaseDistributorSecret: secret },
            });
        } else {
            await this.prisma.settings.update({
                where: { id: settings.id },
                data: { purchaseDistributorSecret: secret },
            });
        }

        await this.sendSuccess(ctx, 'Purchase distributor secret updated!');
    }
}
