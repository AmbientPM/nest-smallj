import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    Asset,
    Keypair,
    Networks,
    TransactionBuilder,
    Operation,
    BASE_FEE,
    Memo,
    Horizon,
} from 'stellar-sdk';

export class StellarAPIError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'StellarAPIError';
    }
}

export class StellarAPICoreLowBalance extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'StellarAPICoreLowBalance';
    }
}

@Injectable()
export class StellarService {
    private readonly logger = new Logger(StellarService.name);
    private server: Horizon.Server;
    private networkPassphrase: string;
    private testnet: boolean;
    private readonly SUPPLY_REFILL_LIMIT = 900_000_000_000;

    constructor(private readonly configService: ConfigService) {
        this.testnet = this.configService.get<string>('STELLAR_NETWORK') !== 'public';

        if (this.testnet) {
            this.server = new Horizon.Server('https://horizon-testnet.stellar.org');
            this.networkPassphrase = Networks.TESTNET;
        } else {
            this.server = new Horizon.Server('https://horizon.stellar.org');
            this.networkPassphrase = Networks.PUBLIC;
        }
    }

    async checkPublicKey(publicKey: string): Promise<boolean> {
        try {
            await this.server.loadAccount(publicKey);
            return true;
        } catch (error) {
            return false;
        }
    }

    async getBalance(wallet: string, asset: Asset): Promise<number> {
        try {
            const account = await this.server.loadAccount(wallet);
            const balances = account.balances;

            for (const balance of balances) {
                if (balance.asset_type === 'native' && asset.isNative()) {
                    return parseFloat(balance.balance);
                } else if (
                    balance.asset_type !== 'native' &&
                    balance.asset_type !== 'liquidity_pool_shares' &&
                    'asset_code' in balance &&
                    'asset_issuer' in balance &&
                    balance.asset_code === asset.getCode() &&
                    balance.asset_issuer === asset.getIssuer()
                ) {
                    return parseFloat(balance.balance);
                }
            }

            return 0;
        } catch (error) {
            this.logger.error(`Failed to get balance: ${error.message}`);
            throw new StellarAPIError(`Failed to get balance: ${error.message}`);
        }
    }

    async receive(
        sourceAccountPublic: string,
        destinationAccountPublic: string,
        asset: Asset,
        memo: string,
        amount?: number,
    ): Promise<boolean> {
        try {
            const payments = await this.server
                .payments()
                .forAccount(destinationAccountPublic)
                .order('desc')
                .limit(20)
                .call();

            for (const payment of payments.records) {
                if (
                    payment.type === 'payment' &&
                    payment.from === sourceAccountPublic &&
                    payment.to === destinationAccountPublic
                ) {
                    const transaction = await this.server
                        .transactions()
                        .transaction(payment.transaction_hash)
                        .call();

                    const paymentMemo = transaction.memo || '';

                    let paymentAsset: Asset;
                    if (payment.asset_type === 'native') {
                        paymentAsset = Asset.native();
                    } else if (payment.asset_code && payment.asset_issuer) {
                        paymentAsset = new Asset(payment.asset_code, payment.asset_issuer);
                    } else {
                        continue;
                    }

                    if (paymentMemo === memo && paymentAsset.equals(asset)) {
                        if (amount) {
                            const paymentAmount = parseFloat(payment.amount);
                            if (Math.abs(paymentAmount - amount) < 0.0000001) {
                                return true;
                            }
                        } else {
                            return true;
                        }
                    }
                }
            }

            return false;
        } catch (error) {
            this.logger.error(`Failed to check receive: ${error.message}`);
            return false;
        }
    }

    async sendTokens(
        distributor: Keypair,
        amount: number,
        asset: Asset,
        destination: string,
        memo?: string,
    ): Promise<string> {
        try {
            if (distributor.publicKey() === destination) {
                throw new StellarAPIError('Cannot send to self');
            }

            const distributorAccount = await this.server.loadAccount(distributor.publicKey());

            const transactionBuilder = new TransactionBuilder(distributorAccount, {
                fee: BASE_FEE,
                networkPassphrase: this.networkPassphrase,
            });

            transactionBuilder.addOperation(
                Operation.payment({
                    destination,
                    asset,
                    amount: amount.toFixed(7),
                }),
            );

            if (memo) {
                transactionBuilder.addMemo(Memo.text(memo));
            }

            transactionBuilder.setTimeout(30);

            const transaction = transactionBuilder.build();
            transaction.sign(distributor);

            const result = await this.server.submitTransaction(transaction);
            return result.hash;
        } catch (error) {
            this.logger.error(`Failed to send tokens: ${error.message}`);
            throw new StellarAPIError(`Failed to send tokens: ${error.message}`);
        }
    }

    async sendMultipleTokens(
        distributor: Keypair,
        transactions: Array<{ destination: string; asset: Asset; amount: number }>,
        memo?: string,
    ): Promise<string> {
        try {
            const distributorAccount = await this.server.loadAccount(distributor.publicKey());

            const transactionBuilder = new TransactionBuilder(distributorAccount, {
                fee: BASE_FEE,
                networkPassphrase: this.networkPassphrase,
            });

            for (const tx of transactions) {
                transactionBuilder.addOperation(
                    Operation.payment({
                        destination: tx.destination,
                        asset: tx.asset,
                        amount: tx.amount.toFixed(7),
                    }),
                );
            }

            if (memo) {
                transactionBuilder.addMemo(Memo.text(memo));
            }

            transactionBuilder.setTimeout(30);

            const transaction = transactionBuilder.build();
            transaction.sign(distributor);

            const result = await this.server.submitTransaction(transaction);
            return result.hash;
        } catch (error) {
            this.logger.error(`Failed to send multiple tokens: ${error.message}`);
            if (error.response?.data) {
                this.logger.error(`Stellar error details: ${JSON.stringify(error.response.data)}`);
            }
            throw new StellarAPIError(`Failed to send multiple tokens: ${error.message}`);
        }
    }

    async parseHolders(asset: Asset): Promise<Record<string, number>> {
        const holders: Record<string, number> = {};
        const baseUrl = this.testnet
            ? 'https://horizon-testnet.stellar.org'
            : 'https://horizon.stellar.org';
        let url = `${baseUrl}/accounts?asset=${asset.getCode()}:${asset.getIssuer()}&limit=200&order=asc`;

        const retryMax = 5;
        let retryCount = 0;

        while (url) {
            try {
                const response = await fetch(url);

                if (response.status === 200) {
                    const data = await response.json();

                    if (!data._embedded || !data._embedded.records) {
                        this.logger.warn(`ParseHolders:${asset.getCode()}: No holders found`);
                        break;
                    }

                    const records = data._embedded.records;

                    for (const holder of records) {
                        const walletPublicKey = holder.account_id;
                        let walletAssetBalance = 0.0;
                        const walletBalances = holder.balances;

                        for (const balance of walletBalances) {
                            if (
                                balance.asset_code === asset.getCode() &&
                                balance.asset_issuer === asset.getIssuer()
                            ) {
                                walletAssetBalance += parseFloat(balance.balance || '0');
                            }
                        }

                        holders[walletPublicKey] = walletAssetBalance;
                    }

                    this.logger.log(
                        `ParseHolders:${asset.getCode()}: 200 OK, ${records.length} holders found`,
                    );

                    // Get next URL for pagination
                    url = data._links?.next?.href || null;

                    // Don't break on empty records, continue pagination
                    if (!records.length) {
                        break;
                    }

                    // Add delay between successful requests to avoid rate limiting
                    if (url) {
                        await new Promise((resolve) => setTimeout(resolve, 2000));
                    }

                    // Reset retry count on success
                    retryCount = 0;
                } else if (response.status === 429) {
                    // Handle rate limiting
                    let retryAfter = 5;
                    const retryAfterHeader = response.headers.get('Retry-After');

                    if (retryAfterHeader) {
                        const parsed = parseInt(retryAfterHeader, 10);
                        if (!isNaN(parsed)) {
                            retryAfter = parsed;
                        }
                    }

                    if (retryCount < retryMax) {
                        retryCount++;
                        this.logger.warn(
                            `ParseHolders:${asset.getCode()}: 429 Too Many Requests, retrying after ${retryAfter} seconds (attempt ${retryCount}/${retryMax})`,
                        );
                        await new Promise((resolve) => setTimeout(resolve, (retryAfter + 1) * 1000));
                        continue; // Retry the same URL
                    } else {
                        this.logger.error(
                            `ParseHolders:${asset.getCode()}: 429 Too Many Requests, max retries reached, giving up`,
                        );
                        throw new StellarAPIError(
                            `Max retries reached for ${asset.getCode()} holders parsing`,
                        );
                    }
                } else {
                    // Handle other error statuses
                    this.logger.error(
                        `ParseHolders:${asset.getCode()}: ${response.status} No response available`,
                    );

                    if (Object.keys(holders).length === 0) {
                        throw new StellarAPIError(
                            `Request failed with status ${response.status} for ${asset.getCode()}`,
                        );
                    } else {
                        // Return partial results if we already have some holders
                        break;
                    }
                }
            } catch (error) {
                // Don't catch StellarAPIError that we intentionally threw
                if (error instanceof StellarAPIError) {
                    throw error;
                }

                // Handle unexpected errors (network, JSON parse, etc.)
                this.logger.error(
                    `ParseHolders:${asset.getCode()}: Unexpected error while processing response: ${error.message}`,
                    error.stack,
                );

                if (retryCount < retryMax) {
                    retryCount++;
                    this.logger.warn(
                        `ParseHolders:${asset.getCode()}: Unexpected error, retrying (attempt ${retryCount}/${retryMax})`,
                    );
                    await new Promise((resolve) => setTimeout(resolve, 5000));
                    continue; // Retry the same URL
                } else {
                    this.logger.error(
                        `ParseHolders:${asset.getCode()}: Unexpected error, max retries reached, giving up`,
                    );
                    throw new StellarAPIError(
                        `Max retries reached for ${asset.getCode()} holders parsing due to unexpected errors`,
                    );
                }
            }
        }

        return holders;
    }

    getPublicKey(secretKey: string): string {
        return Keypair.fromSecret(secretKey).publicKey();
    }

    async trust(sourceAccount: Keypair, asset: Asset): Promise<void> {
        try {
            const distributorAccount = await this.server.loadAccount(sourceAccount.publicKey());

            const trustTransaction = new TransactionBuilder(distributorAccount, {
                fee: '20000',
                networkPassphrase: this.networkPassphrase,
            })
                .addOperation(
                    Operation.changeTrust({
                        asset,
                    }),
                )
                .setTimeout(100)
                .build();

            trustTransaction.sign(sourceAccount);
            await this.server.submitTransaction(trustTransaction);
        } catch (error) {
            this.logger.error(`Failed to add trustline: ${error.message}`);
            throw new StellarAPIError(`Failed to add trustline: ${error.message}`);
        }
    }

    async generateToken(
        name: string,
        supply: number,
        issuer: Keypair,
        distributor: Keypair,
    ): Promise<void> {
        try {
            const distributorAccount = await this.server.loadAccount(distributor.publicKey());
            const nwoToken = new Asset(name, issuer.publicKey());

            // Add trustline first
            const trustTransaction = new TransactionBuilder(distributorAccount, {
                fee: '10000',
                networkPassphrase: this.networkPassphrase,
            })
                .addOperation(
                    Operation.changeTrust({
                        asset: nwoToken,
                    }),
                )
                .setTimeout(100)
                .build();

            trustTransaction.sign(distributor);
            await this.server.submitTransaction(trustTransaction);

            // Now send tokens from issuer to distributor
            const issuingAccount = await this.server.loadAccount(issuer.publicKey());
            const paymentTransaction = new TransactionBuilder(issuingAccount, {
                fee: '10000',
                networkPassphrase: this.networkPassphrase,
            })
                .addOperation(
                    Operation.payment({
                        destination: distributor.publicKey(),
                        asset: nwoToken,
                        amount: supply.toFixed(7),
                    }),
                )
                .setTimeout(100)
                .build();

            paymentTransaction.sign(issuer);
            await this.server.submitTransaction(paymentTransaction);
        } catch (error) {
            this.logger.error(`Failed to generate token: ${error.message}`);
            throw new StellarAPIError(`Failed to generate token: ${error.message}`);
        }
    }

    async assetInfo(asset: Asset): Promise<any> {
        try {
            const network = this.testnet ? 'testnet' : 'public';
            let url: string;

            if (asset.isNative()) {
                url = `https://api.stellar.expert/explorer/${network}/asset/XLM`;
            } else {
                url = `https://api.stellar.expert/explorer/${network}/asset/${asset.getCode()}-${asset.getIssuer()}`;
            }

            const response = await fetch(url);

            if (response.status === 429) {
                throw new StellarAPIError('Too many requests to Stellar API');
            }

            const data = await response.json();
            const tomlInfo = data.toml_info;
            data.tomlInfo = tomlInfo;

            if (tomlInfo) {
                delete data.toml_info;
            }

            return data;
        } catch (error) {
            this.logger.error(`Failed to get asset info: ${error.message}`);
            return null;
        }
    }

    async getOffer(
        account: string,
        selling: Asset,
        buying: Asset,
    ): Promise<any | null> {
        try {
            const offers = await this.server
                .offers()
                .forAccount(account)
                .limit(1)
                .order('desc')
                .call();

            const records = offers.records.filter((offer) => {
                const offerSelling = offer.selling as any;
                const offerBuying = offer.buying as any;

                const sellingMatch = selling.isNative()
                    ? offerSelling.asset_type === 'native'
                    : offerSelling.asset_code === selling.getCode() &&
                    offerSelling.asset_issuer === selling.getIssuer();

                const buyingMatch = buying.isNative()
                    ? offerBuying.asset_type === 'native'
                    : offerBuying.asset_code === buying.getCode() &&
                    offerBuying.asset_issuer === buying.getIssuer();

                return sellingMatch && buyingMatch;
            });

            return records.length > 0 ? records[0] : null;
        } catch (error) {
            this.logger.error(`Failed to get offer: ${error.message}`);
            return null;
        }
    }
}
