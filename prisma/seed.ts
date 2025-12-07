import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Starting seed...');

    // Create mock user
    const mockUser = await prisma.user.upsert({
        where: { telegramId: BigInt(999999999) },
        update: {},
        create: {
            telegramId: BigInt(999999999),
            telegramUsername: 'mock_user',
            telegramName: 'Mock User',
            xlmBalance: 1000,
        },
    });
    console.log('✅ Mock user created:', mockUser);

    // Create test users
    const testUser1 = await prisma.user.upsert({
        where: { telegramId: BigInt(111111111) },
        update: {},
        create: {
            telegramId: BigInt(111111111),
            telegramUsername: 'test_user1',
            telegramName: 'Test User 1',
            xlmBalance: 500,
        },
    });
    console.log('✅ Test user 1 created:', testUser1);

    const testUser2 = await prisma.user.upsert({
        where: { telegramId: BigInt(222222222) },
        update: {},
        create: {
            telegramId: BigInt(222222222),
            telegramUsername: 'test_user2',
            telegramName: 'Test User 2',
            xlmBalance: 750,
        },
    });
    console.log('✅ Test user 2 created:', testUser2);

    // Create wallets for mock user
    const wallet1 = await prisma.wallet.upsert({
        where: { publicKey: 'GCKUZK3B4O5XKA5TM2CJB5UZE5NHIQN2A2Y4XTYBIVV47AWZVPYFDNWO' },
        update: {},
        create: {
            userId: mockUser.id,
            publicKey: 'GCKUZK3B4O5XKA5TM2CJB5UZE5NHIQN2A2Y4XTYBIVV47AWZVPYFDNWO',
            balance: 1000,
            isActive: true,
        },
    });
    console.log('✅ Wallet 1 created:', wallet1);

    const wallet2 = await prisma.wallet.upsert({
        where: { publicKey: 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' },
        update: {},
        create: {
            userId: mockUser.id,
            publicKey: 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
            balance: 500,
            isActive: true,
        },
    });
    console.log('✅ Wallet 2 created:', wallet2);

    // Create billing details for mock user
    const billingDetails = await prisma.billingDetails.upsert({
        where: { userId: mockUser.id },
        update: {},
        create: {
            userId: mockUser.id,
            fullName: 'Mock User Full Name',
            address: '123 Test Street',
            city: 'Test City',
            country: 'Test Country',
            zipCode: '12345',
        },
    });
    console.log('✅ Billing details created:', billingDetails);

    // Create settings
    const settings = await prisma.settings.upsert({
        where: { id: 1 },
        update: {},
        create: {
            depositAddress: 'GCKUZK3B4O5XKA5TM2CJB5UZE5NHIQN2A2Y4XTYBIVV47AWZVPYFDNWO',
            depositAmount: 10,
            issuerPublic: 'GCKUZK3B4O5XKA5TM2CJB5UZE5NHIQN2A2Y4XTYBIVV47AWZVPYFDNWO',
            issuerSecret: 'SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
            sendingEnabled: true,
            xrpDepositAddress: 'rXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
            xrpNwoPrice: 0.5,
            purchaseDistributorPublic: 'GCKUZK3B4O5XKA5TM2CJB5UZE5NHIQN2A2Y4XTYBIVV47AWZVPYFDNWO',
            purchaseDistributorSecret: 'SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
            rewardsTier: {
                defaultPercent: 5,
                levels: [
                    { minamount: 0, maxamount: 1000, percent: 5 },
                    { minamount: 1000, maxamount: 5000, percent: 7 },
                    { minamount: 5000, maxamount: 10000, percent: 10 },
                ],
            },
            swapTier: {
                defaultPercent: 2,
                levels: [
                    { minamount: 0, maxamount: 100, percent: 2 },
                    { minamount: 100, maxamount: 500, percent: 1.5 },
                    { minamount: 500, maxamount: 1000, percent: 1 },
                ],
            },
        },
    });
    console.log('✅ Settings created:', settings);

    // Create staking assets
    const stakingAsset1 = await prisma.stakingAsset.upsert({
        where: { id: 1 },
        update: {},
        create: {
            assetCode: 'NWO',
            assetIssuer: 'GCKUZK3B4O5XKA5TM2CJB5UZE5NHIQN2A2Y4XTYBIVV47AWZVPYFDNWO',
            price: 1.5,
            tier: {
                defaultPercent: 10,
                levels: [
                    { minamount: 0, maxamount: 1000, percent: 10 },
                    { minamount: 1000, maxamount: 5000, percent: 15 },
                    { minamount: 5000, maxamount: 10000, percent: 20 },
                ],
            },
            premium: 0,
        },
    });
    console.log('✅ Staking asset 1 created:', stakingAsset1);

    const stakingAsset2 = await prisma.stakingAsset.upsert({
        where: { id: 2 },
        update: {},
        create: {
            assetCode: 'USDC',
            assetIssuer: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
            price: 1.0,
            tier: {
                defaultPercent: 5,
                levels: [
                    { minamount: 0, maxamount: 1000, percent: 5 },
                    { minamount: 1000, maxamount: 5000, percent: 7 },
                    { minamount: 5000, maxamount: 10000, percent: 10 },
                ],
            },
            premium: 5,
        },
    });
    console.log('✅ Staking asset 2 created:', stakingAsset2);

    // Create distributors
    const distributor1 = await prisma.distributor.upsert({
        where: { id: 1 },
        update: {},
        create: {
            publicKey: 'GCKUZK3B4O5XKA5TM2CJB5UZE5NHIQN2A2Y4XTYBIVV47AWZVPYFDNWO',
            secretKey: 'SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
            isActive: true,
        },
    });
    console.log('✅ Distributor 1 created:', distributor1);

    const distributor2 = await prisma.distributor.upsert({
        where: { id: 2 },
        update: {},
        create: {
            publicKey: 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
            secretKey: 'SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
            isActive: true,
        },
    });
    console.log('✅ Distributor 2 created:', distributor2);

    // Create companies
    const company1 = await prisma.company.upsert({
        where: { id: 1 },
        update: {},
        create: {
            name: 'Test Company 1',
            logoUrl: 'https://example.com/logo1.png',
            addingAmount: 100,
        },
    });
    console.log('✅ Company 1 created:', company1);

    const company2 = await prisma.company.upsert({
        where: { id: 2 },
        update: {},
        create: {
            name: 'Test Company 2',
            logoUrl: 'https://example.com/logo2.png',
            addingAmount: 200,
        },
    });
    console.log('✅ Company 2 created:', company2);

    // Create liquidity entries
    const liquidity1 = await prisma.liquidity.upsert({
        where: { id: 1 },
        update: {},
        create: {
            milestone: 1000,
            startAmount: 0,
            addingAmount: 100,
            endAmount: 10000,
            distributorPublic: 'GCKUZK3B4O5XKA5TM2CJB5UZE5NHIQN2A2Y4XTYBIVV47AWZVPYFDNWO',
        },
    });
    console.log('✅ Liquidity 1 created:', liquidity1);

    const liquidity2 = await prisma.liquidity.upsert({
        where: { id: 2 },
        update: {},
        create: {
            milestone: 2000,
            startAmount: 0,
            addingAmount: 50,
            endAmount: 5000,
            distributorPublic: 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
        },
    });
    console.log('✅ Liquidity 2 created:', liquidity2);

    // Create action logs
    const actionLog1 = await prisma.actionLog.create({
        data: {
            userId: mockUser.id,
            username: 'mock_user',
            fullName: 'Mock User',
            actionType: 'USER_REGISTERED',
            actionData: { source: 'seed' },
        },
    });
    console.log('✅ Action log 1 created:', actionLog1);

    const actionLog2 = await prisma.actionLog.create({
        data: {
            userId: mockUser.id,
            username: 'mock_user',
            fullName: 'Mock User',
            actionType: 'WALLET_ADDED',
            actionData: { publicKey: wallet1.publicKey },
        },
    });
    console.log('✅ Action log 2 created:', actionLog2);

    console.log('🎉 Seed completed successfully!');
}

main()
    .catch((e) => {
        console.error('❌ Seed failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
