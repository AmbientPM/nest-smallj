import { Update, Ctx, On } from 'nestjs-telegraf';
import { UseGuards, Injectable } from '@nestjs/common';
import type { Context } from '../interfaces/context.interface';
import { IsPrivateGuard } from '../guards/is-private.guard';
import { IsAdminGuard } from '../guards/is-admin.guard';
import { AdminStakingUpdate } from './admin/staking.update';
import { AdminDistributorsUpdate } from './admin/distributors.update';
import { AdminCompaniesUpdate } from './admin/companies.update';
import { AdminLiquidityUpdate } from './admin/liquidity.update';
import { AdminStakingAssetsUpdate } from './admin/staking-assets.update';
import { AdminRewardsTierUpdate } from './admin/rewards-tier.update';
import { AdminSwapTierUpdate } from './admin/swap-tier.update';
import { AdminRaiseTierPercentUpdate } from './admin/raise-tier-percent.update';

@Update()
@UseGuards(IsPrivateGuard, IsAdminGuard)
@Injectable()
export class TextHandlerUpdate {
    constructor(
        private readonly stakingUpdate: AdminStakingUpdate,
        private readonly distributorsUpdate: AdminDistributorsUpdate,
        private readonly companiesUpdate: AdminCompaniesUpdate,
        private readonly liquidityUpdate: AdminLiquidityUpdate,
        private readonly stakingAssetsUpdate: AdminStakingAssetsUpdate,
        private readonly rewardsTierUpdate: AdminRewardsTierUpdate,
        private readonly swapTierUpdate: AdminSwapTierUpdate,
        private readonly raiseTierPercentUpdate: AdminRaiseTierPercentUpdate,
    ) { }

    @On('text')
    async handleTextInput(@Ctx() ctx: Context) {
        const step = ctx.session.step;

        console.log('[TextHandler] Received text, session step:', step);

        if (!step) {
            console.log('[TextHandler] No step in session, ignoring');
            return;
        }

        // Route to appropriate handler based on session step prefix
        // Check more specific patterns first before general ones
        if (step === 'raise_tier_coefficient') {
            return this.raiseTierPercentUpdate.handleTextInput(ctx);
        }

        if (step.startsWith('rewards_tier_')) {
            return this.rewardsTierUpdate.handleTextInput(ctx);
        }

        if (step.startsWith('swap_tier_')) {
            return this.swapTierUpdate.handleTextInput(ctx);
        }

        if (step.startsWith('staking_asset_')) {
            return this.stakingAssetsUpdate.handleTextInput(ctx);
        }

        if (step.startsWith('company_')) {
            return this.companiesUpdate.handleTextInput(ctx);
        }

        if (step.startsWith('liquidity_')) {
            return this.liquidityUpdate.handleTextInput(ctx);
        }

        if (step === 'distributor_secret' || step === 'distributor_public') {
            return this.distributorsUpdate.handleTextInput(ctx);
        }

        if (step.startsWith('staking_') || step === 'issuer_secret' || step === 'purchase_distributor_secret' ||
            step === 'xrp_deposit_address' || step === 'xrp_nwo_price' || step === 'deposit_address' || step === 'deposit_amount') {
            return this.stakingUpdate.handleTextInput(ctx);
        }

        console.log('[TextHandler] No handler found for step:', step);
    }

    @On('photo')
    async handlePhoto(@Ctx() ctx: Context) {
        const step = ctx.session.step;

        console.log('[TextHandler] Received photo, session step:', step);

        if (step === 'company_logo') {
            return this.companiesUpdate.handlePhoto(ctx);
        }

        console.log('[TextHandler] No photo handler found for step:', step);
    }
}
