import { PrismaService } from '../../database/prisma.service';

export async function getStakingInfo(prisma: PrismaService): Promise<string> {
    const settings = await prisma.settings.findFirst();

    let text = '<b>⚙️ Admin Panel</b>\n\n';
    text += '<b>📊 Current Settings:</b>\n\n';

    text += `<b>XLM Deposit:</b>\n`;
    text += `  Address: <code>${settings?.depositAddress ? settings.depositAddress.substring(0, 15) + '...' : '❌ Not set'}</code>\n`;
    text += `  Amount: ${settings?.depositAmount || '❌ Not set'}\n\n`;

    text += `<b>XRP Settings:</b>\n`;
    text += `  Address: <code>${settings?.xrpDepositAddress ? settings.xrpDepositAddress.substring(0, 15) + '...' : '❌ Not set'}</code>\n`;
    text += `  Price: ${settings?.xrpNwoPrice || '❌ Not set'} NWO\n\n`;

    text += `<b>Issuer:</b>\n`;
    text += `  Public: <code>${settings?.issuerPublic ? settings.issuerPublic.substring(0, 15) + '...' : '❌ Not set'}</code>\n`;
    text += `  Sending: ${settings?.sendingEnabled ? '✅ Enabled' : '❌ Disabled'}\n\n`;

    text += `<b>Purchase Distributor:</b> ${settings?.purchaseDistributorSecret ? '✅ Configured' : '❌ Not set'}\n\n`;

    text += '👇 <i>Use the buttons below to manage settings</i>';

    return text;
}

export async function getLiquidityInfo(prisma: PrismaService): Promise<string> {
    const liquidity = await prisma.liquidity.findFirst();
    const companiesCount = await prisma.company.count();

    let text = '<b>💧 Liquidity Settings</b>\n\n';

    text += `<b>Milestone:</b> ${liquidity?.milestone || '❌ Not set'}\n`;
    text += `<b>Start Amount:</b> ${liquidity?.startAmount || '❌ Not set'}\n`;
    text += `<b>End Amount:</b> ${liquidity?.endAmount || '❌ Not set'}\n`;
    text += `<b>Distributor:</b> <code>${liquidity?.distributorPublic ? liquidity.distributorPublic.substring(0, 15) + '...' : '❌ Not set'}</code>\n\n`;
    text += `<b>Companies:</b> ${companiesCount}\n\n`;

    text += '👇 <i>Use the buttons below to manage liquidity</i>';

    return text;
}

export function getCompanyInfo(companyId: number, prisma: PrismaService): string {
    return `<b>Company Info</b>\n\nCompany ID: ${companyId}`;
}

export function getStakingAssetInfo(assetId: number, prisma: PrismaService): string {
    return `<b>Staking Asset Info</b>\n\nAsset ID: ${assetId}`;
}
