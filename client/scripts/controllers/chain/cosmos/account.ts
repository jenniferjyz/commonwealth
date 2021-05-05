import _ from 'lodash';
import BN from 'bn.js';
import { IApp } from 'state';
import { CosmosToken } from 'controllers/chain/cosmos/types';
import { Account, IAccountsModule } from 'models';
import { AccountsStore } from 'stores';
import {
  Secp256k1HdWallet,
  AuthAccountsResponse,
  StdSignDoc,
  Msg,
  StdTx,
  StdFee,
  SigningCosmosClient,
  encodeSecp256k1Pubkey,
} from '@cosmjs/launchpad';
import { BondStatus } from '@cosmjs/launchpad/build/lcdapi/staking';
import { Secp256k1Pubkey } from '@cosmjs/amino';

import CosmosChain from './chain';

export interface ICosmosValidator {
  // TODO: add more properties (commission, unbonding, jailed, etc)
  // TODO: if we wanted, we could get all delegations to a validator, but is this necessary?
  pubkey: string;
  operator: string;
  tokens: CosmosToken;
  description: any;
  status: BondStatus;
  isJailed: boolean;
}

export class CosmosAccount extends Account<CosmosToken> {
  private _Chain: CosmosChain;
  private _Accounts: CosmosAccounts;

  // TODO: add delegations, validations
  private _wallet: Secp256k1HdWallet;
  private _pubKey: Secp256k1Pubkey;
  private _client: SigningCosmosClient;
  public get pubKey() { return this._pubKey; }
  public get client() { return this._client; }

  private _balance: CosmosToken;
  public get balance() { return this.updateBalance().then(() => this._balance); }

  constructor(app: IApp, ChainInfo: CosmosChain, Accounts: CosmosAccounts, address: string) {
    super(app, app.chain.meta.chain, address);
    if (!app.isModuleReady) {
      // defer chain initialization
      app.chainModuleReady.once('ready', () => {
        if (app.chain.chain instanceof CosmosChain) this._Chain = app.chain.chain;
        else console.error('Did not successfully initialize account with chain');
      });
    } else {
      this._Chain = ChainInfo;
    }
    this._Accounts = Accounts;
    this._Accounts.store.add(this);
  }

  public async setWallet(wallet: Secp256k1HdWallet) {
    this._wallet = wallet;
    const [{ address, pubkey }] = await wallet.getAccounts();
    this._pubKey = encodeSecp256k1Pubkey(pubkey);
    this._client = new SigningCosmosClient(this._Chain.url, address, wallet);
  }

  // TODO: these should be sync, or we need to change rest of code to match
  protected async addressFromMnemonic(mnemonic: string): Promise<string> {
    const wallet = await Secp256k1HdWallet.fromMnemonic(mnemonic);
    const [{ address }] = await wallet.getAccounts();
    return address;
  }

  protected async addressFromSeed(seed: string): Promise<string> {
    return this.addressFromMnemonic(seed);
  }

  public async signMessage(message: string): Promise<string> {
    const aminoMsg: StdSignDoc = JSON.parse(message);
    if (!this._wallet) {
      throw new Error('Wallet required to sign.');
    }
    const [{ address }] = await this._wallet.getAccounts();
    const resp = await this._wallet.signAmino(address, aminoMsg);
    return resp.signature.signature;
  }

  public async signMsg(msg: Msg, fee: StdFee, memo?: string): Promise<StdTx> {
    const signed = await this._client.sign([ msg ], fee, memo);
    return signed;
  }

  public updateBalance = _.throttle(async () => {
    let resp: AuthAccountsResponse;
    try {
      resp = await this._Chain.api.auth.account(this.address);
    } catch (e) {
      // if coins is null, they have a zero balance
      console.log(`no balance found: ${JSON.stringify(e)}`);
      this._balance = this._Chain.coins(0);
    }
    // JSON incompatibilities...
    if (!resp) {
      console.error('could not update balance');
      return;
    }
    if (resp && resp.result.value.coins && resp.result.value.coins[0]) {
      for (const coins of resp.result.value.coins) {
        const bal = new BN(coins.amount);
        if (coins.denom === this._Chain.denom) {
          this._balance = this._Chain.coins(bal, true);
        } else {
          console.log(`found invalid denomination: ${coins.denom}`);
        }
      }
    }
    if (!this._balance) {
      console.log('no compatible denominations found');
      this._balance = this._Chain.coins(0);
    }
    return this._balance;
  });

  public sendBalanceTx(recipient: CosmosAccount, amount: CosmosToken, memo: string = '') {
    const args = {
      toAddress: recipient.address,
      amounts: [ { denom: amount.denom, amount: amount.toString() } ]
    };
    const txFn = (gas: number) => this._Chain.tx(
      'MsgSend', this.address, args, memo, gas, this._Chain.denom
    );
    return this._Chain.createTXModalData(
      this,
      txFn,
      'MsgSend',
      `${this.address} sent ${amount.format()} to ${recipient.address}`,
      // TODO: add these for other txs
      (success: boolean) => {
        if (success) {
          this.updateBalance();
          recipient.updateBalance();
        }
      },
    );
  }

  public delegateTx(validatorAddress: string, amount: CosmosToken, memo: string = '') {
    const args = {
      validatorAddress,
      amount: amount.toString(),
      denom: amount.denom,
    };
    const txFn = (gas: number) => this._Chain.tx(
      'MsgDelegate', this.address, args, memo, gas, this._Chain.denom
    );
    return this._Chain.createTXModalData(
      this,
      txFn,
      'MsgDelegate',
      `${this.address} delegated ${amount.format()} to ${validatorAddress}`
    );
  }

  public undelegateTx(validatorAddress: string, amount: CosmosToken, memo: string = '') {
    const args = {
      validatorAddress,
      amount: amount.toString(),
      denom: amount.denom,
    };
    const txFn = (gas: number) => this._Chain.tx(
      'MsgUndelegate', this.address, args, memo, gas, this._Chain.denom
    );
    return this._Chain.createTXModalData(
      this,
      txFn,
      'MsgUndelegate',
      `${this.address} undelegated ${amount.format()} from ${validatorAddress}`
    );
  }

  public redelegateTx(validatorSource: string, validatorDest: string, amount: CosmosToken, memo: string = '') {
    const args = {
      validatorSourceAddress: validatorSource,
      validatorDestinationAddress: validatorDest,
      amount: amount.toString(),
      denom: amount.denom,
    };
    const txFn = (gas: number) => this._Chain.tx(
      'MsgRedelegate', this.address, args, memo, gas, this._Chain.denom
    );
    return this._Chain.createTXModalData(
      this,
      txFn,
      'MsgRedelegate',
      `${this.address} redelegated ${amount.format()} from ${validatorSource} to ${validatorDest}`
    );
  }

  public withdrawDelegationRewardTx(validatorAddress: string, memo: string = '') {
    const args = { validatorAddress };
    const txFn = (gas: number) => this._Chain.tx(
      'MsgWithdrawDelegationReward', this.address, args, memo, gas, this._Chain.denom
    );
    return this._Chain.createTXModalData(
      this,
      txFn,
      'MsgDelegate',
      `${this.address} withdrew reward from ${validatorAddress}`
    );
  }
}

export class CosmosAccounts implements IAccountsModule<CosmosToken, CosmosAccount> {
  private _initialized: boolean = false;
  public get initialized() { return this._initialized; }

  // STORAGE
  private _store: AccountsStore<CosmosAccount> = new AccountsStore();
  public get store() { return this._store; }

  private _Chain: CosmosChain;

  public get(address: string) {
    return this.fromAddress(address);
  }

  private _app: IApp;
  public get app() { return this._app; }

  constructor(app: IApp) {
    this._app = app;
  }

  public fromAddress(address: string): CosmosAccount {
    // accepts bech32 encoded cosmosxxxxx addresses and not cosmospubxxx
    let acct;
    try {
      acct = this._store.getByAddress(address);
    } catch (e) {
      acct = new CosmosAccount(this.app, this._Chain, this, address);
    }
    return acct;
  }

  public fromAddressIfExists(address: string): CosmosAccount | null {
    try {
      return this._store.getByAddress(address);
    } catch (e) {
      return null;
    }
  }

  public async fromMnemonic(mnemonic: string) {
    const wallet = await Secp256k1HdWallet.fromMnemonic(mnemonic);
    const [{ address }] = await wallet.getAccounts();
    const acct = new CosmosAccount(this.app, this._Chain, this, address);
    await acct.setMnemonic(mnemonic);
    await acct.setWallet(wallet);
    return acct;
  }
  public async fromSeed(seed: string) {
    return this.fromMnemonic(seed);
  }

  public deinit() {
    this._initialized = false;
    this.store.clear();
  }

  public async init(ChainInfo: CosmosChain): Promise<void> {
    this._Chain = ChainInfo;
    this._initialized = true;
  }
}
