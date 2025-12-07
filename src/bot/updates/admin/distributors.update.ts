import { Update, Ctx, Action, On } from 'nestjs-telegraf';
import { UseGuards } from '@nestjs/common';
import type { Context } from '../../interfaces/context.interface';
import { IsPrivateGuard } from '../../guards/is-private.guard';
import { IsAdminGuard } from '../../guards/is-admin.guard';
import { PrismaService } from '../../../database/prisma.service';
import { Markup } from 'telegraf';
import { cancelKeyboard } from '../../keyboards/keyboards';

@Update()
@UseGuards(IsPrivateGuard, IsAdminGuard)
export class AdminDistributorsUpdate {
    constructor(private readonly prisma: PrismaService) { }

    @Action(/^list_distributors:(\d+)$/)
    async listDistributors(@Ctx() ctx: Context) {
        const callbackQuery = ctx.callbackQuery;
        if (!callbackQuery || !('data' in callbackQuery)) return; const page = parseInt(callbackQuery.data.split(':')[1]);
        const itemsPerPage = 10;
        const skip = (page - 1) * itemsPerPage;

        const [distributors, total] = await Promise.all([
            this.prisma.distributor.findMany({
                where: { isActive: true },
                skip,
                take: itemsPerPage,
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.distributor.count({ where: { isActive: true } }),
        ]);

        const buttons = distributors.map((dist) => [
            Markup.button.callback(
                `${dist.publicKey.substring(0, 10)}...`,
                `distributor:${dist.id}`,
            ),
            Markup.button.callback('❌', `delete_distributor:${dist.id}`),
        ]);

        buttons.push([Markup.button.callback('Add distributor', 'create_distributor')]);

        const navigation: any[] = [];
        if (page > 1) {
            navigation.push(
                Markup.button.callback('⬅️', `list_distributors:${page - 1}`),
            );
        }
        if (skip + itemsPerPage < total) {
            navigation.push(
                Markup.button.callback('➡️', `list_distributors:${page + 1}`),
            );
        }

        if (navigation.length > 0) {
            buttons.push(navigation);
        } buttons.push([Markup.button.callback('◀️ Back', 'menu')]);

        await ctx.editMessageText('Distributors', {
            reply_markup: { inline_keyboard: buttons },
        });
        await ctx.answerCbQuery();
    }

    @Action('create_distributor')
    async createDistributor(@Ctx() ctx: Context) {
        ctx.session.step = 'distributor_secret';
        await ctx.reply('Enter distributor secret:', cancelKeyboard);
        await ctx.answerCbQuery();
    }

    @Action(/^delete_distributor:(\d+)$/)
    async deleteDistributor(@Ctx() ctx: Context) {
        const callbackQuery = ctx.callbackQuery;
        if (!callbackQuery || !('data' in callbackQuery)) return; const distributorId = parseInt(callbackQuery.data.split(':')[1]);

        await this.prisma.distributor.update({
            where: { id: distributorId },
            data: { isActive: false },
        });

        await ctx.answerCbQuery('Distributor deleted');

        // Refresh the list
        await this.listDistributors(ctx);
    }

    async handleTextInput(@Ctx() ctx: Context) {
        console.log('[Distributors] Text received, session:', ctx.session);
        console.log('[Distributors] Session step:', ctx.session.step);

        if (ctx.session.step !== 'distributor_secret') {
            console.log('[Distributors] Step mismatch, returning');
            return;
        }

        console.log('[Distributors] Processing distributor input');

        const text = (ctx.message as any).text;

        try {
            // TODO: Validate secret key and get public key with Stellar SDK
            // For now, just use a placeholder
            const publicKey = text; // Should extract public key from secret

            // Check if already exists
            const existing = await this.prisma.distributor.findUnique({
                where: { publicKey },
            });

            if (existing) {
                await ctx.reply('This distributor already exists', cancelKeyboard);
                return;
            }

            await this.prisma.distributor.create({
                data: {
                    publicKey,
                    secretKey: text,
                    isActive: true,
                },
            });

            ctx.session = {};
            await ctx.reply('Distributor added successfully!');

            // Show the list
            const distributors = await this.prisma.distributor.findMany({
                where: { isActive: true },
                take: 10,
                orderBy: { createdAt: 'desc' },
            });

            const buttons = distributors.map((dist) => [
                Markup.button.callback(
                    `${dist.publicKey.substring(0, 10)}...`,
                    `distributor:${dist.id}`,
                ),
                Markup.button.callback('❌', `delete_distributor:${dist.id}`),
            ]);

            buttons.push([Markup.button.callback('Add distributor', 'create_distributor')]);
            buttons.push([Markup.button.callback('◀️ Back', 'menu')]);

            await ctx.reply('Distributors', {
                reply_markup: { inline_keyboard: buttons },
            });
        } catch (error) {
            await ctx.reply(
                error instanceof Error ? error.message : 'Invalid secret key',
                cancelKeyboard,
            );
        }
    }
}
