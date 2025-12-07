import { Update, Ctx, Action, On } from 'nestjs-telegraf';
import { UseGuards } from '@nestjs/common';
import type { Context } from '../../interfaces/context.interface';
import { IsPrivateGuard } from '../../guards/is-private.guard';
import { IsAdminGuard } from '../../guards/is-admin.guard';
import { PrismaService } from '../../../database/prisma.service';
import { adminLiquidityKeyboard, cancelKeyboard, backToLiquidityKeyboard } from '../../keyboards/keyboards';
import { getLiquidityInfo } from '../../utils/messages';
import { MessageManager } from '../../utils/message-manager';

@Update()
@UseGuards(IsPrivateGuard, IsAdminGuard)
export class AdminLiquidityUpdate {
    constructor(private readonly prisma: PrismaService) { }

    private async sendSuccess(ctx: Context, message: string) {
        await MessageManager.deleteRemembered(ctx);
        try {
            await ctx.deleteMessage();
        } catch (e) { }
        ctx.session = {};
        await ctx.reply(`✅ ${message}`, backToLiquidityKeyboard);
    }

    @Action('liquidity')
    async showLiquidity(@Ctx() ctx: Context) {
        const info = await getLiquidityInfo(this.prisma);
        await MessageManager.editOrSend(ctx, info, {
            parse_mode: 'HTML',
            ...adminLiquidityKeyboard,
        });
        await ctx.answerCbQuery();
    }

    @Action('liquidity_set:milestone')
    async setMilestone(@Ctx() ctx: Context) {
        ctx.session.step = 'liquidity_milestone';
        await MessageManager.sendAndRemember(ctx, '💬 Enter new liquidity milestone value:', cancelKeyboard);
        await ctx.answerCbQuery();
    }

    @Action('liquidity_set:amount')
    async setStartAmount(@Ctx() ctx: Context) {
        ctx.session.step = 'liquidity_start_amount';
        await MessageManager.sendAndRemember(ctx, '💬 Enter new liquidity start amount:', cancelKeyboard);
        await ctx.answerCbQuery();
    }

    @Action('liquidity_set:end_amount')
    async setEndAmount(@Ctx() ctx: Context) {
        ctx.session.step = 'liquidity_end_amount';
        await MessageManager.sendAndRemember(ctx, '💬 Enter new liquidity end amount:', cancelKeyboard);
        await ctx.answerCbQuery();
    }

    @Action('liquidity_set:distributor')
    async setDistributor(@Ctx() ctx: Context) {
        ctx.session.step = 'liquidity_distributor';
        await MessageManager.sendAndRemember(ctx, '💬 Enter distributor public key:', cancelKeyboard);
        await ctx.answerCbQuery();
    }

    async handleTextInput(@Ctx() ctx: Context) {
        console.log('[Liquidity] Text received, session:', ctx.session);
        console.log('[Liquidity] Session step:', ctx.session.step);

        if (!ctx.session.step?.startsWith('liquidity_')) {
            console.log('[Liquidity] Step mismatch, returning');
            return;
        }

        console.log('[Liquidity] Processing liquidity input');

        const text = (ctx.message as any).text;

        try {
            switch (ctx.session.step) {
                case 'liquidity_milestone':
                    await this.handleMilestone(ctx, text);
                    break;

                case 'liquidity_start_amount':
                    await this.handleStartAmount(ctx, text);
                    break;

                case 'liquidity_end_amount':
                    await this.handleEndAmount(ctx, text);
                    break;

                case 'liquidity_distributor':
                    await this.handleDistributor(ctx, text);
                    break;
            }
        } catch (error) {
            await ctx.reply(
                error instanceof Error ? error.message : 'An error occurred',
                cancelKeyboard,
            );
        }
    }

    private async handleMilestone(ctx: Context, milestoneStr: string) {
        const milestone = parseFloat(milestoneStr);

        if (isNaN(milestone)) {
            throw new Error('Milestone must be a number');
        }

        let liquidity = await this.prisma.liquidity.findFirst();

        if (!liquidity) {
            liquidity = await this.prisma.liquidity.create({
                data: {
                    milestone,
                    startAmount: 0,
                    addingAmount: 0,
                    endAmount: 0,
                },
            });
        } else {
            await this.prisma.liquidity.update({
                where: { id: liquidity.id },
                data: { milestone },
            });
        }

        ctx.session = {};
        await ctx.reply('Liquidity milestone updated successfully!');
        const info = await getLiquidityInfo(this.prisma);
        await ctx.reply(info, {
            parse_mode: 'HTML',
            ...adminLiquidityKeyboard,
        });
    }

    private async handleStartAmount(ctx: Context, amountStr: string) {
        const startAmount = parseFloat(amountStr);

        if (isNaN(startAmount)) {
            throw new Error('Amount must be a number');
        }

        let liquidity = await this.prisma.liquidity.findFirst();

        if (!liquidity) {
            liquidity = await this.prisma.liquidity.create({
                data: {
                    milestone: 0,
                    startAmount,
                    addingAmount: 0,
                    endAmount: 0,
                },
            });
        } else {
            await this.prisma.liquidity.update({
                where: { id: liquidity.id },
                data: { startAmount },
            });
        }

        ctx.session = {};
        await ctx.reply('Liquidity start amount updated successfully!');
        const info = await getLiquidityInfo(this.prisma);
        await ctx.reply(info, {
            parse_mode: 'HTML',
            ...adminLiquidityKeyboard,
        });
    }

    private async handleEndAmount(ctx: Context, amountStr: string) {
        const endAmount = parseFloat(amountStr);

        if (isNaN(endAmount)) {
            throw new Error('Amount must be a number');
        }

        let liquidity = await this.prisma.liquidity.findFirst();

        if (!liquidity) {
            liquidity = await this.prisma.liquidity.create({
                data: {
                    milestone: 0,
                    startAmount: 0,
                    addingAmount: 0,
                    endAmount,
                },
            });
        } else {
            await this.prisma.liquidity.update({
                where: { id: liquidity.id },
                data: { endAmount },
            });
        }

        ctx.session = {};
        await ctx.reply('Liquidity end amount updated successfully!');
        const info = await getLiquidityInfo(this.prisma);
        await ctx.reply(info, {
            parse_mode: 'HTML',
            ...adminLiquidityKeyboard,
        });
    }

    private async handleDistributor(ctx: Context, distributorPublic: string) {
        let liquidity = await this.prisma.liquidity.findFirst();

        if (!liquidity) {
            liquidity = await this.prisma.liquidity.create({
                data: {
                    milestone: 0,
                    startAmount: 0,
                    addingAmount: 0,
                    endAmount: 0,
                    distributorPublic,
                },
            });
        } else {
            await this.prisma.liquidity.update({
                where: { id: liquidity.id },
                data: { distributorPublic },
            });
        }

        ctx.session = {};
        await ctx.reply('Liquidity distributor updated successfully!');
        const info = await getLiquidityInfo(this.prisma);
        await ctx.reply(info, {
            parse_mode: 'HTML',
            ...adminLiquidityKeyboard,
        });
    }
}
