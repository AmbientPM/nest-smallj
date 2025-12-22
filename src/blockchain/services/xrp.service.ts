import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export class XRPAPIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'XRPAPIError';
  }
}

export class XRPAPITooManyRequests extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'XRPAPITooManyRequests';
  }
}

interface XRPTransaction {
  tx: {
    Account: string;
    Destination: string;
    Amount: string | any;
    Memos?: Array<{ Memo: { MemoData?: string } }>;
    ledger_index: number;
  };
  meta: {
    TransactionResult: string;
  };
}

@Injectable()
export class XRPService {
  private readonly logger = new Logger(XRPService.name);
  private serverUrl: string;
  private network: string;

  constructor(private readonly configService: ConfigService) {
    const testnet = this.configService.get<string>('XRP_NETWORK') === 'testnet';

    if (testnet) {
      this.serverUrl = 'https://s.altnet.rippletest.net:51234';
      this.network = 'testnet';
    } else {
      this.serverUrl = 'https://s1.ripple.com:51234';
      this.network = 'mainnet';
    }
  }

  isValidAddress(address: string): boolean {
    if (!address || typeof address !== 'string') {
      return false;
    }

    // XRP Classic addresses start with 'r' and are 25-35 characters
    if (!address.startsWith('r')) {
      return false;
    }

    if (address.length < 25 || address.length > 35) {
      return false;
    }

    // Valid base58 characters
    const validChars = new Set(
      'rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz',
    );

    for (const char of address) {
      if (!validChars.has(char)) {
        return false;
      }
    }

    return true;
  }

  private async makeRequest(method: string, params: any[] = []): Promise<any> {
    const payload = {
      method,
      params,
    };

    const maxRetries = 5;
    let retryCount = 0;

    while (retryCount < maxRetries) {
      try {
        const response = await axios.post(this.serverUrl, payload, {
          headers: { 'Content-Type': 'application/json' },
        });

        if (response.status === 200) {
          const data = response.data;

          if (data.result?.status === 'error') {
            const errorMsg = data.result?.error || 'Unknown error';
            this.logger.error(`XRPAPI: RPC Error: ${errorMsg}`);
            throw new XRPAPIError(`RPC Error: ${errorMsg}`);
          }

          return data;
        } else if (response.status === 429) {
          const retryAfter = parseInt(
            response.headers['retry-after'] || '5',
            10,
          );
          retryCount++;

          if (retryCount < maxRetries) {
            this.logger.warn(
              `XRPAPI: 429 Too Many Requests, retrying after ${retryAfter} seconds (attempt ${retryCount}/${maxRetries})`,
            );
            await new Promise((resolve) =>
              setTimeout(resolve, (retryAfter + 1) * 1000),
            );
          } else {
            this.logger.error(
              'XRPAPI: 429 Too Many Requests, max retries reached',
            );
            throw new XRPAPITooManyRequests('Too many requests');
          }
        } else {
          throw new XRPAPIError(
            `HTTP ${response.status}: ${response.statusText}`,
          );
        }
      } catch (error) {
        if (
          error instanceof XRPAPIError ||
          error instanceof XRPAPITooManyRequests
        ) {
          throw error;
        }

        retryCount++;
        if (retryCount < maxRetries) {
          this.logger.warn(
            `XRPAPI: Request failed, retrying (attempt ${retryCount}/${maxRetries})`,
          );
          await new Promise((resolve) => setTimeout(resolve, 2000));
        } else {
          this.logger.error(
            `XRPAPI: Request failed after ${maxRetries} attempts`,
          );
          throw new XRPAPIError('Max retries reached');
        }
      }
    }

    throw new XRPAPIError('Max retries reached');
  }

  async getAccountTransactions(
    account: string,
    limit: number = 5,
  ): Promise<XRPTransaction[]> {
    try {
      const params = [
        {
          account,
          ledger_index_min: -1,
          ledger_index_max: -1,
          limit,
        },
      ];

      const response = await this.makeRequest('account_tx', params);
      const transactions = response.result?.transactions || [];

      // Sort by ledger_index descending (newest first)
      transactions.sort((a, b) => b.tx.ledger_index - a.tx.ledger_index);

      return transactions;
    } catch (error) {
      this.logger.error(`Failed to get account transactions: ${error.message}`);
      throw error;
    }
  }

  async receive(
    sourceAccountAddress: string,
    destinationAccountAddress: string,
    memo?: string,
    amount?: number,
    currency: string = 'XRP',
  ): Promise<boolean> {
    try {
      if (!this.isValidAddress(sourceAccountAddress)) {
        throw new XRPAPIError('Invalid source address');
      }

      if (!this.isValidAddress(destinationAccountAddress)) {
        throw new XRPAPIError('Invalid destination address');
      }

      const transactions = await this.getAccountTransactions(
        destinationAccountAddress,
        20,
      );

      for (const tx of transactions) {
        const payment = tx.tx;

        // Check if it's a successful payment
        if (tx.meta.TransactionResult !== 'tesSUCCESS') {
          continue;
        }

        // Check if sender and receiver match
        if (payment.Account !== sourceAccountAddress) {
          continue;
        }

        if (payment.Destination !== destinationAccountAddress) {
          continue;
        }

        // Check currency
        const txAmount = payment.Amount;
        const isXRP = typeof txAmount === 'string';

        if (currency === 'XRP' && !isXRP) {
          continue;
        }

        // Check memo if provided
        if (memo) {
          const memos = payment.Memos || [];
          let foundMemo = false;

          for (const memoObj of memos) {
            if (memoObj.Memo?.MemoData) {
              const decodedMemo = Buffer.from(
                memoObj.Memo.MemoData,
                'hex',
              ).toString('utf-8');
              if (decodedMemo === memo) {
                foundMemo = true;
                break;
              }
            }
          }

          if (!foundMemo) {
            continue;
          }
        }

        // Check amount if provided
        if (amount !== undefined) {
          let txAmountValue: number;

          if (isXRP) {
            txAmountValue = parseInt(txAmount, 10) / 1_000_000; // Convert drops to XRP
          } else {
            txAmountValue = parseFloat(txAmount.value);
          }

          if (Math.abs(txAmountValue - amount) < 0.0000001) {
            return true;
          }
        } else {
          return true;
        }
      }

      return false;
    } catch (error) {
      this.logger.error(`Failed to check receive: ${error.message}`);
      return false;
    }
  }

  async checkAccountExists(account: string): Promise<boolean> {
    try {
      const params = [
        {
          account,
          ledger_index: 'validated',
        },
      ];

      const response = await this.makeRequest('account_info', params);
      return !!response.result?.account_data;
    } catch (error) {
      return false;
    }
  }

  async getBalance(
    account: string,
    currency: string = 'XRP',
    issuer?: string,
  ): Promise<number> {
    try {
      const params = [
        {
          account,
          ledger_index: 'validated',
        },
      ];

      const response = await this.makeRequest('account_info', params);
      const accountData = response.result?.account_data;

      if (!accountData) {
        return 0;
      }

      if (currency === 'XRP') {
        const balance = parseInt(accountData.Balance, 10) / 1_000_000; // Convert drops to XRP
        return balance;
      } else {
        // For tokens, need to check trust lines
        const linesParams = [
          {
            account,
            ledger_index: 'validated',
          },
        ];

        const linesResponse = await this.makeRequest(
          'account_lines',
          linesParams,
        );
        const lines = linesResponse.result?.lines || [];

        for (const line of lines) {
          if (
            line.currency === currency &&
            (!issuer || line.account === issuer)
          ) {
            return parseFloat(line.balance);
          }
        }

        return 0;
      }
    } catch (error) {
      this.logger.error(`Failed to get balance: ${error.message}`);
      throw new XRPAPIError(`Failed to get balance: ${error.message}`);
    }
  }
}
