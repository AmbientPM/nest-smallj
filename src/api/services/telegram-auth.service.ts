import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

export interface TelegramUser {
    id: bigint;
    first_name: string;
    last_name?: string;
    username?: string;
    language_code?: string;
}

@Injectable()
export class TelegramAuthService {
    constructor(private readonly botToken: string) { }

    validateInitData(initData: string): TelegramUser | null {
        try {
            const urlParams = new URLSearchParams(initData);
            const hash = urlParams.get('hash');
            urlParams.delete('hash');

            // Create data check string
            const dataCheckArr: string[] = [];
            for (const [key, value] of urlParams.entries()) {
                dataCheckArr.push(`${key}=${value}`);
            }
            dataCheckArr.sort();
            const dataCheckString = dataCheckArr.join('\n');

            // Generate secret key
            const secretKey = crypto
                .createHmac('sha256', 'WebAppData')
                .update(this.botToken)
                .digest();

            // Generate hash
            const calculatedHash = crypto
                .createHmac('sha256', secretKey)
                .update(dataCheckString)
                .digest('hex');

            if (calculatedHash !== hash) {
                return null;
            }

            // Parse user data
            const userParam = urlParams.get('user');
            if (!userParam) {
                return null;
            }

            const userData = JSON.parse(userParam);
            const user: TelegramUser = {
                ...userData,
                id: BigInt(userData.id),
            };
            return user;
        } catch (error) {
            console.error('Telegram auth validation error:', error);
            return null;
        }
    }
}
