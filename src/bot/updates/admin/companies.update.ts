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
export class AdminCompaniesUpdate {
    constructor(private readonly prisma: PrismaService) { }

    @Action(/^list_companies:(\d+)$/)
    async listCompanies(@Ctx() ctx: Context) {
        const callbackQuery = ctx.callbackQuery;
        if (!callbackQuery || !('data' in callbackQuery)) return;

        const page = parseInt(callbackQuery.data.split(':')[1]);
        const itemsPerPage = 10;
        const skip = (page - 1) * itemsPerPage;

        const [companies, total] = await Promise.all([
            this.prisma.company.findMany({
                skip,
                take: itemsPerPage,
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.company.count(),
        ]);

        const buttons = companies.map((company) => [
            Markup.button.callback(company.name, `company:${company.id}`),
        ]);

        buttons.push([Markup.button.callback('Add company', 'add_company')]);

        const navigation: any[] = [];
        if (page > 1) {
            navigation.push(Markup.button.callback('⬅️', `list_companies:${page - 1}`));
        }
        if (skip + itemsPerPage < total) {
            navigation.push(Markup.button.callback('➡️', `list_companies:${page + 1}`));
        }

        if (navigation.length > 0) {
            buttons.push(navigation);
        }

        buttons.push([Markup.button.callback('Menu', 'menu')]);

        await ctx.editMessageText('Companies', {
            reply_markup: { inline_keyboard: buttons },
        });
        await ctx.answerCbQuery();
    }

    @Action(/^company:(\d+)$/)
    async showCompany(@Ctx() ctx: Context) {
        const callbackQuery = ctx.callbackQuery;
        if (!callbackQuery || !('data' in callbackQuery)) return;

        const companyId = parseInt(callbackQuery.data.split(':')[1]);
        const company = await this.prisma.company.findUnique({
            where: { id: companyId },
        });

        if (!company) {
            await ctx.answerCbQuery('Company not found', { show_alert: true });
            return;
        }

        const info = `<b>Company Info</b>

Name: ${company.name}
Adding Amount: ${company.addingAmount}
Logo: ${company.logoUrl || 'No logo'}`;

        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('Delete', `delete_company:${company.id}`)],
            [Markup.button.callback('Back', 'list_companies:1')],
            [Markup.button.callback('◀️ Back', 'menu')],
        ]);

        await ctx.editMessageText(info, {
            parse_mode: 'HTML',
            ...keyboard,
        });
        await ctx.answerCbQuery();
    }

    @Action(/^delete_company:(\d+)$/)
    async deleteCompany(@Ctx() ctx: Context) {
        const callbackQuery = ctx.callbackQuery;
        if (!callbackQuery || !('data' in callbackQuery)) return;

        const companyId = parseInt(callbackQuery.data.split(':')[1]);

        await this.prisma.company.delete({
            where: { id: companyId },
        });

        await ctx.answerCbQuery('Company deleted successfully', { show_alert: true });

        // Refresh the list
        await this.listCompanies(ctx);
    }

    @Action('add_company')
    async addCompany(@Ctx() ctx: Context) {
        ctx.session.step = 'company_name';
        await ctx.editMessageText('Send company name', cancelKeyboard);
        await ctx.answerCbQuery();
    }

    async handleTextInput(@Ctx() ctx: Context) {
        console.log('[Companies] Text received, session:', ctx.session);
        console.log('[Companies] Session step:', ctx.session.step);

        if (!ctx.session.step?.startsWith('company_')) {
            console.log('[Companies] Step mismatch, returning');
            return;
        }

        console.log('[Companies] Processing company input');

        const text = (ctx.message as any).text;

        try {
            switch (ctx.session.step) {
                case 'company_name':
                    ctx.session.data = { name: text };
                    ctx.session.step = 'company_logo';
                    await ctx.reply('Send company logo (or /skip)', cancelKeyboard);
                    break;

                case 'company_adding_amount':
                    const amount = parseFloat(text);
                    if (isNaN(amount)) {
                        throw new Error('Amount must be a number');
                    }

                    await this.prisma.company.create({
                        data: {
                            name: ctx.session.data!.name,
                            logoUrl: ctx.session.data!.logo || null,
                            addingAmount: amount,
                        },
                    });

                    ctx.session = {};
                    await ctx.reply('Company added successfully!');

                    // Show companies list
                    const companies = await this.prisma.company.findMany({
                        take: 10,
                        orderBy: { createdAt: 'desc' },
                    });

                    const buttons = companies.map((company) => [
                        Markup.button.callback(company.name, `company:${company.id}`),
                    ]);

                    buttons.push([Markup.button.callback('Add company', 'add_company')]);
                    buttons.push([Markup.button.callback('◀️ Back', 'menu')]);

                    await ctx.reply('Companies', {
                        reply_markup: { inline_keyboard: buttons },
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

    async handlePhoto(@Ctx() ctx: Context) {
        if (ctx.session.step !== 'company_logo') return;

        // TODO: Download and upload photo to storage
        // For now, just use file_id
        const photo = (ctx.message as any).photo;
        const fileId = photo[photo.length - 1].file_id;

        ctx.session.data!.logo = fileId;
        ctx.session.step = 'company_adding_amount';

        await ctx.reply('Send adding amount', cancelKeyboard);
    }
}
