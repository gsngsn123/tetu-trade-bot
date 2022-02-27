import Common from "ethereumjs-common";

export class Config {

  public readonly RINKEBY_CHAIN = Common.forCustomChain(
    'mainnet', {
      name: 'rinkeby',
      networkId: 4,
      chainId: 4
    },
    'petersburg'
  );

  public readonly MATIC_CHAIN = Common.forCustomChain(
    'mainnet', {
      name: 'matic',
      networkId: 137,
      chainId: 137
    },
    'petersburg'
  );

  public readonly FANTOM_CHAIN = Common.forCustomChain(
    'mainnet', {
      name: 'fantom',
      networkId: 250,
      chainId: 250
    },
    'petersburg'
  );

  bot: string;
  positionOwner: string;
  rpcUrl: string;
  privateKey: string;
  chain: Common;
  net: string;


  constructor() {


    this.privateKey = process.env.SIGNER_KEY as string;
    this.net = process.env.NET as string;

    if (this.net === 'rinkeby') {
      this.chain = this.RINKEBY_CHAIN;
      this.rpcUrl = process.env.RINKEBY_URL as string;
      this.bot = process.env.RINKEBY_BOT as string;
      this.positionOwner = process.env.RINKEBY_OWNER as string;
    } else if (this.net === 'matic') {
      this.chain = this.MATIC_CHAIN;
      this.rpcUrl = process.env.MATIC_URL as string;
      this.bot = process.env.MATIC_BOT as string;
      this.positionOwner = process.env.MATIC_OWNER as string;
    } else if (this.net === 'fantom') {
      this.chain = this.FANTOM_CHAIN;
      this.rpcUrl = process.env.FANTOM_URL as string;
      this.bot = process.env.FANTOM_BOT as string;
      this.positionOwner = process.env.FANTOM_OWNER as string;
    } else {
      throw Error('Unknown network ' + this.net);
    }
  }
}
