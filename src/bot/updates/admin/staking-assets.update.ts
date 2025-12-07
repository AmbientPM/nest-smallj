import { Update, Ctx, Action, On } from 'nestjs-telegraf';
import { UseGuards } from '@nestjs/common';
import type { Context } from '../../interfaces/context.interface';
import { IsPrivateGuard } from '../../guards/is-private.guard';
import { IsAdminGuard } from '../../guards/is-admin.guard';
import { PrismaService } from '../../../database/prisma.service';
import { Markup } from 'telegraf';
import { cancelKeyboard, backToMenuKeyboard } from '../../keyboards/keyboards';

@Update()
@UseGuards(IsPrivateGuard, IsAdminGuard)
export class AdminStakingAssetsUpdate {
    constructor(private readonly prisma: PrismaService) { }

    @Action(/^list_staking_assets:(\d+)$/)
    async listStakingAssets(@Ctx() ctx: Context) {
        const callbackQuery = ctx.callbackQuery;
        if (!callbackQuery || !('data' in callbackQuery)) return;

        const page = parseInt(callbackQuery.data.split(':')[1]);
        const itemsPerPage = 10;
        const skip = (page - 1) * itemsPerPage;

        const [assets, total] = await Promise.all([
            this.prisma.stakingAsset.findMany({
                skip,
                take: itemsPerPage,
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.stakingAsset.count(),
        ]);

        const buttons = assets.map((asset) => [
            Markup.button.callback(asset.assetCode, `staking_asset:${asset.id}`),
        ]);

        buttons.push([Markup.button.callback('Add asset', 'create_staking_asset')]);

        const navigation: any[] = [];
        if (page > 1) {
            navigation.push(
                Markup.button.callback('⬅️', `list_staking_assets:${page - 1}`),
            );
        }
        if (skip + itemsPerPage < total) {
            navigation.push(
                Markup.button.callback('➡️', `list_staking_assets:${page + 1}`),
            );
        }

        if (navigation.length > 0) {
            buttons.push(navigation);
        }

        buttons.push([Markup.button.callback('Menu', 'menu')]);

        await ctx.editMessageText('Staking Assets', {
            reply_markup: { inline_keyboard: buttons },
        });
        await ctx.answerCbQuery();
    }

    @Action(/^staking_asset:(\d+)$/)
    async showStakingAsset(@Ctx() ctx: Context) {
        const callbackQuery = ctx.callbackQuery;
        if (!callbackQuery || !('data' in callbackQuery)) return;

        const assetId = parseInt(callbackQuery.data.split(':')[1]);
        const asset = await this.prisma.stakingAsset.findUnique({
            where: { id: assetId },
        });

        if (!asset) {
            await ctx.answerCbQuery('Asset not found', { show_alert: true });
            return;
        }

        const info = `<b>Staking Asset Info</b>

Asset Code: ${asset.assetCode}
Asset Issuer: ${asset.assetIssuer}
Price: ${asset.price}
Premium: ${asset.premium}`;

        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('Update Price', `staking_asset_update_price:${asset.id}`)],
            [Markup.button.callback('Change Tier', `staking_asset_tier:${asset.id}`)],
            [Markup.button.callback('Premium Asset', `staking_asset_premium:${asset.id}`)],
            [Markup.button.callback('Delete', `staking_asset_delete:${asset.id}`)],
            [Markup.button.callback('◀️ Back', 'menu')],
        ]);

        await ctx.editMessageText(info, {
            parse_mode: 'HTML',
            ...keyboard,
        });
        await ctx.answerCbQuery();
    }

    @Action('create_staking_asset')
    async createStakingAsset(@Ctx() ctx: Context) {
        ctx.session.step = 'staking_asset_code';
        await ctx.editMessageText(
            'Enter asset name (e.g. XLM, BTC, ETH) or multiple assets (one per line):',
            cancelKeyboard,
        );
        await ctx.answerCbQuery();
    }

    @Action(/^staking_asset_delete:(\d+)$/)
    async deleteStakingAsset(@Ctx() ctx: Context) {
        const callbackQuery = ctx.callbackQuery;
        if (!callbackQuery || !('data' in callbackQuery)) return;

        const assetId = parseInt(callbackQuery.data.split(':')[1]);

        await this.prisma.stakingAsset.delete({
            where: { id: assetId },
        });

        await ctx.answerCbQuery('Asset deleted successfully', { show_alert: true });

        // Refresh the list
        await this.listStakingAssets(ctx);
    }

    @Action(/^staking_asset_update_price:(\d+)$/)
    async updateStakingAssetPrice(@Ctx() ctx: Context) {
        const callbackQuery = ctx.callbackQuery;
        if (!callbackQuery || !('data' in callbackQuery)) return;

        const assetId = parseInt(callbackQuery.data.split(':')[1]);
        ctx.session.step = 'staking_asset_update_price';
        ctx.session.data = { assetId };

        await ctx.editMessageText('Enter new price:', cancelKeyboard);
        await ctx.answerCbQuery();
    }

    @Action(/^staking_asset_premium:(\d+)$/)
    async updateStakingAssetPremium(@Ctx() ctx: Context) {
        const callbackQuery = ctx.callbackQuery;
        if (!callbackQuery || !('data' in callbackQuery)) return;

        const assetId = parseInt(callbackQuery.data.split(':')[1]);
        ctx.session.step = 'staking_asset_premium';
        ctx.session.data = { assetId };

        await ctx.editMessageText('Enter premium value:', cancelKeyboard);
        await ctx.answerCbQuery();
    }

    @Action(/^staking_asset_tier:(\d+)$/)
    async updateStakingAssetTier(@Ctx() ctx: Context) {
        const callbackQuery = ctx.callbackQuery;
        if (!callbackQuery || !('data' in callbackQuery)) return;

        const assetId = parseInt(callbackQuery.data.split(':')[1]);
        const asset = await this.prisma.stakingAsset.findUnique({
            where: { id: assetId },
        });

        if (!asset) {
            await ctx.answerCbQuery('Asset not found', { show_alert: true });
            return;
        }

        const tier = (asset.tier as any) || { levels: [] };
        ctx.session.data = { assetId, tier };

        const keyboard = this.buildTierKeyboard(tier, assetId);

        await ctx.editMessageText(`<b>Tier Management for ${asset.assetCode}</b>`, {
            parse_mode: 'HTML',
            reply_markup: keyboard,
        });
        await ctx.answerCbQuery();
    }

    @Action(/^staking_asset_tier_edit:(\d+):(.+):(\d+)$/)
    async editTier(@Ctx() ctx: Context) {
        const callbackQuery = ctx.callbackQuery;
        if (!callbackQuery || !('data' in callbackQuery)) return;

        const [_, assetIdStr, command, indexStr] = callbackQuery.data.split(':');
        const assetId = parseInt(assetIdStr);
        const index = parseInt(indexStr);

        const tier = ctx.session.data?.tier || { levels: [] };

        try {
            if (command === 'add') {
                ctx.session.step = 'staking_asset_tier_from';
                ctx.session.data = { assetId, tier, editingIndex: tier.levels.length };
                await ctx.editMessageText('Enter "from" value:', cancelKeyboard);
            } else if (command === 'finish') {
                await this.prisma.stakingAsset.update({
                    where: { id: assetId },
                    data: { tier },
                });

                ctx.session = {};
                await ctx.editMessageText('✅ Tier updated successfully!', backToMenuKeyboard);
            } else if (command === 'delete') {
                tier.levels.splice(index, 1);
                ctx.session.data = { assetId, tier };

                const keyboard = this.buildTierKeyboard(tier, assetId);
                await ctx.editMessageText('<b>Tier Management</b>', {
                    parse_mode: 'HTML',
                    reply_markup: keyboard,
                });
            } else {
                ctx.session.step = `staking_asset_tier_${command}`;
                ctx.session.data = { assetId, tier, editingIndex: index };
                await ctx.editMessageText(`Enter ${command} value:`, cancelKeyboard);
            }

            await ctx.answerCbQuery();
        } catch (error) {
            console.error('[StakingAssets] Error editing tier:', error);
            await ctx.answerCbQuery('Error updating tier', { show_alert: true });
        }
    }

    async handleTextInput(@Ctx() ctx: Context) {
        console.log('[StakingAssets] Text received, session:', ctx.session);
        console.log('[StakingAssets] Session step:', ctx.session.step);

        if (!ctx.session.step?.startsWith('staking_asset_')) {
            console.log('[StakingAssets] Step mismatch, returning');
            return;
        }

        console.log('[StakingAssets] Processing staking asset input');

        const text = (ctx.message as any).text;

        try {
            switch (ctx.session.step) {
                case 'staking_asset_code':
                    ctx.session.data = { assetCode: text };
                    ctx.session.step = 'staking_asset_price';
                    await ctx.reply('Enter asset price:', cancelKeyboard);
                    break;

                case 'staking_asset_price':
                    const price = parseFloat(text);
                    if (isNaN(price)) {
                        throw new Error('Price must be a number');
                    }

                    const settings = await this.prisma.settings.findFirst();
                    const issuer = settings?.issuerPublic || 'default_issuer';

                    // Get default tier from rewards tier
                    const defaultTier = settings?.rewardsTier || {};

                    await this.prisma.stakingAsset.create({
                        data: {
                            assetCode: ctx.session.data!.assetCode,
                            assetIssuer: issuer,
                            price,
                            tier: defaultTier,
                            premium: 0,
                        },
                    });

                    ctx.session = {};
                    await ctx.reply('Staking asset added successfully!');

                    // Show assets list
                    const assets = await this.prisma.stakingAsset.findMany({
                        take: 10,
                        orderBy: { createdAt: 'desc' },
                    });

                    const buttons = assets.map((asset) => [
                        Markup.button.callback(asset.assetCode, `staking_asset:${asset.id}`),
                    ]);

                    buttons.push([
                        Markup.button.callback('Add asset', 'create_staking_asset'),
                    ]);
                    buttons.push([Markup.button.callback('◀️ Back', 'menu')]);

                    await ctx.reply('Staking Assets', {
                        reply_markup: { inline_keyboard: buttons },
                    });
                    break;

                case 'staking_asset_update_price':
                    const newPrice = parseFloat(text);
                    if (isNaN(newPrice)) {
                        throw new Error('Price must be a number');
                    }

                    await this.prisma.stakingAsset.update({
                        where: { id: ctx.session.data!.assetId },
                        data: { price: newPrice },
                    });

                    ctx.session = {};
                    await ctx.reply('Price updated successfully!');
                    break;

                case 'staking_asset_premium':
                    const premium = parseFloat(text);
                    if (isNaN(premium)) {
                        throw new Error('Premium must be a number');
                    }

                    await this.prisma.stakingAsset.update({
                        where: { id: ctx.session.data!.assetId },
                        data: { premium },
                    });

                    ctx.session = {};
                    await ctx.reply('Premium updated successfully!');
                    break;

                case 'staking_asset_tier_from':
                    const from = parseFloat(text);
                    if (isNaN(from)) {
                        throw new Error('From must be a number');
                    }

                    ctx.session.data!.from = from;
                    ctx.session.step = 'staking_asset_tier_to';
                    await ctx.reply('Enter "to" value:', cancelKeyboard);
                    break;

                case 'staking_asset_tier_to':
                    const to = parseFloat(text);
                    if (isNaN(to)) {
                        throw new Error('To must be a number');
                    }

                    ctx.session.data!.to = to;
                    ctx.session.step = 'staking_asset_tier_percent';
                    await ctx.reply('Enter "percent" value:', cancelKeyboard);
                    break;

                case 'staking_asset_tier_percent':
                    const percent = parseFloat(text);
                    if (isNaN(percent)) {
                        throw new Error('Percent must be a number');
                    }

                    const tier = ctx.session.data!.tier;
                    const editingIndex = ctx.session.data!.editingIndex;

                    if (editingIndex >= tier.levels.length) {
                        tier.levels.push({
                            from: ctx.session.data!.from,
                            to: ctx.session.data!.to,
                            percent,
                        });
                    } else {
                        tier.levels[editingIndex].percent = percent;
                    }

                    const assetId = ctx.session.data!.assetId;
                    ctx.session.data = { assetId, tier };

                    const keyboard = this.buildTierKeyboard(tier, assetId);
                    await ctx.reply('<b>Tier Management</b>', {
                        parse_mode: 'HTML',
                        reply_markup: keyboard,
                    });
                    break;
            }
        } catch (error) {
            await ctx.reply(
                error instanceof Error ? error.message : 'An error occurred',
                cancelKeyboard,
            );
        }
    }

    private buildTierKeyboard(tier: any, assetId: number) {
        const buttons: any[] = [];

        tier.levels.forEach((level: any, index: number) => {
            buttons.push([
                Markup.button.callback(
                    `${level.from} - ${level.to}: ${level.percent}%`,
                    `staking_asset_tier_edit:${assetId}:noop:${index}`,
                ),
            ]);
            buttons.push([
                Markup.button.callback('Edit From', `staking_asset_tier_edit:${assetId}:from:${index}`),
                Markup.button.callback('Edit To', `staking_asset_tier_edit:${assetId}:to:${index}`),
                Markup.button.callback('Edit %', `staking_asset_tier_edit:${assetId}:percent:${index}`),
                Markup.button.callback('❌', `staking_asset_tier_edit:${assetId}:delete:${index}`),
            ]);
        });

        buttons.push([Markup.button.callback('➕ Add Level', `staking_asset_tier_edit:${assetId}:add:0`)]);
        buttons.push([Markup.button.callback('✅ Finish', `staking_asset_tier_edit:${assetId}:finish:0`)]);

        return { inline_keyboard: buttons };
    }
}
