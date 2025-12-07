import { Markup } from 'telegraf';

export const cancelKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback('❌ Cancel', 'cancel')],
]);

export const backToMenuKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback('◀️ Back to Menu', 'menu')],
]);

export const backToStakingKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback('◀️ Back', 'menu')],
]);

export const backToLiquidityKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback('◀️ Back', 'liquidity')],
]);

export const userMenuKeyboard = (appUrl: string) =>
    Markup.inlineKeyboard([
        Markup.button.webApp('🕹 App', appUrl),
    ]);

export const adminStakingKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback('💰 Deposit Settings', 'staking_deposits')],
    [Markup.button.callback('🔑 Issuer & Keys', 'staking_keys')],
    [Markup.button.callback('💧 Liquidity', 'liquidity')],
    [Markup.button.callback('📊 Distributors', 'list_distributors:1')],
    [Markup.button.callback('🪙 Staking Assets', 'list_staking_assets:1')],
    [Markup.button.callback('📈 Tier Management', 'tier_management')],
    [Markup.button.callback('📸 Welcome Image', 'set_welcome_image')],
]);

export const adminDepositSettingsKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback('XLM Deposit Address', 'staking_set:deposit_address')],
    [Markup.button.callback('XLM Deposit Amount', 'staking_set:deposit_amount')],
    [Markup.button.callback('XRP Deposit Address', 'staking_set:xrp_deposit_address')],
    [Markup.button.callback('XRP/NWO Price', 'staking_set:xrp_nwo_price')],
    [Markup.button.callback('◀️ Back', 'menu')],
]);

export const adminKeysKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback('Change Issuer Keys', 'staking_set:issuer_keys')],
    [Markup.button.callback('Purchase Distributor Secret', 'set_purchase_distributor_secret')],
    [Markup.button.callback('Toggle Sending', 'staking_set:toggle_sending')],
    [Markup.button.callback('◀️ Back', 'menu')],
]);

export const adminTierManagementKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback('📊 Raise Tier Percent', 'raise_tier_percent')],
    [Markup.button.callback('🎁 Rewards Tier', 'rewards_tier')],
    [Markup.button.callback('🔄 Swap Tier', 'swap_tier')],
    [Markup.button.callback('◀️ Back', 'menu')],
]);

export const adminLiquidityKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback('Change Milestone', 'liquidity_set:milestone')],
    [Markup.button.callback('Change Start Amount', 'liquidity_set:amount')],
    [Markup.button.callback('Change End Amount', 'liquidity_set:end_amount')],
    [Markup.button.callback('Change Distributor', 'liquidity_set:distributor')],
    [Markup.button.callback('🏢 Companies', 'list_companies:1')],
    [Markup.button.callback('◀️ Back', 'menu')],
]);
