import {ContractTransaction, ethers, utils} from "ethers";
import {SpeedUp} from "./SpeedUp";
import Common from "ethereumjs-common";
import {
  Erc20__factory,
  ImpermaxBorrowable__factory,
  ImpermaxCollateral__factory,
  ImpermaxVault__factory,
  Lp__factory,
  PriceCalculator__factory,
  SmartVault__factory,
  Splitter__factory,
  Strategy__factory
} from "../types/ethers-contracts";
import {ImpermaxStrat__factory} from "../types/ethers-contracts/factories/ImpermaxStrat__factory";
import {TypedEvent} from "../types/ethers-contracts/common";

const MATIC_CHAIN = Common.forCustomChain(
  'mainnet', {
    name: 'matic',
    networkId: 137,
    chainId: 137
  },
  'petersburg'
);

const FANTOM_CHAIN = Common.forCustomChain(
  'mainnet', {
    name: 'fantom',
    networkId: 250,
    chainId: 250
  },
  'petersburg'
);

const FIND_EVENTS_STEP = 1_000;

export class Utils {

  public static SPLITTER_PREFIX = 'SPLITTER___';

  public static delay(ms: number) {
    if (ms === 0) {
      return;
    }
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public static async waitBlocks(provider: ethers.providers.Provider, blocks: number) {
    const start = await provider.getBlockNumber();
    while (true) {
      console.log('wait 10sec');
      await Utils.delay(10000);
      const bn = await provider.getBlockNumber();
      if (bn >= start + blocks) {
        break;
      }
    }
  }

  public static async runAndWait(provider: ethers.providers.Provider, callback: () => Promise<ContractTransaction>, stopOnError = true, wait = true) {
    try {
      const tr = await callback();
      if (!wait) {
        return;
      }
      await Utils.waitBlocks(provider, 1);

      console.log('tx sent', tr.hash);
      const hash = await Utils.waitAndSpeedUp(provider, tr.hash);
      if (!hash || hash === 'error') {
        throw Error("Wrong hash! " + hash);
      }
      const receipt = await provider.getTransactionReceipt(hash);
      console.log('transaction result', hash, receipt?.status);
      if (receipt?.status !== 1 && stopOnError) {
        throw Error("Wrong status!");
      } else {
        if (receipt?.status !== 1) {
          console.log('WRONG STATUS!', hash)
        }
      }
    } catch (e) {
      if (stopOnError) {
        throw e;
      } else {
        console.log('error', e)
      }
    }
  }

  public static async waitAndSpeedUp(provider: ethers.providers.Provider, hash: string, speedUp = true, addNonce = 0): Promise<string> {
    console.log('waitAndSpeedUp', hash);
    let receipt;
    let count = 0;
    while (true) {
      receipt = await provider.getTransactionReceipt(hash);
      if (!!receipt) {
        break;
      }
      console.log('not yet complete', count, hash);
      await Utils.delay(10000);
      count++;
      if (count > 180 && speedUp) {
        const newHash = await SpeedUp.speedUp(hash, provider, addNonce);
        if (!newHash || newHash === 'error') {
          throw Error("Wrong speedup! " + hash);
        }
        return await Utils.waitAndSpeedUp(provider, newHash, true, addNonce + 1);
      }
    }
    return hash;
  }

  public static async getDefaultNetworkGas(provider: ethers.providers.Provider) {
    const net = await provider.getNetwork();
    switch (net.chainId) {
      case 137:
        return 30_000_000_000;
      case 250:
        return 300_000_000_000;
      default:
        throw new Error('Unknown net ' + net.chainId)
    }
  }

  public static async getBlockGasLimit(provider: ethers.providers.Provider) {
    const net = await provider.getNetwork();
    switch (net.chainId) {
      case 137:
        return 15_000_000;
      case 250:
        return 9_000_000;
      default:
        throw new Error('Unknown net ' + net.chainId)
    }
  }

  public static async getAverageBlockTime(provider: ethers.providers.Provider) {
    const net = await provider.getNetwork();
    switch (net.chainId) {
      case 137:
        return 2.5;
      case 250:
        return 1.5;
      default:
        throw new Error('Unknown net ' + net.chainId)
    }
  }

  public static async getCurrentGas(provider: ethers.providers.Provider) {
    try {
      return Math.max(+(await provider.getGasPrice()).toString(), await Utils.getDefaultNetworkGas(provider));
    } catch (e) {
      console.error('Error get gas price', e);
      return await Utils.getDefaultNetworkGas(provider);
    }

  }

  public static async getChainConfig(provider: ethers.providers.Provider) {
    const net = await provider.getNetwork();
    switch (net.chainId) {
      case 137:
        return MATIC_CHAIN;
      case 250:
        return FANTOM_CHAIN;
      default:
        throw new Error('Unknown net ' + net.chainId)
    }
  }

  public static async vaultName(vaultOrSplitter: string, provider: ethers.providers.Provider): Promise<string> {
    try {
      return await SmartVault__factory.connect(vaultOrSplitter, provider).name()
    } catch (e) {
      //assume it is splitter
      const v = await Splitter__factory.connect(vaultOrSplitter, provider).vault();
      return Utils.SPLITTER_PREFIX + await Utils.vaultName(v, provider);
    }
  }

  public static async getBlockByDate(dateSec: number, provider: ethers.providers.Provider) {
    const currentDate = Math.floor(Date.now() / 1000);
    const avg = await Utils.getAverageBlockTime(provider);
    const dateDif = currentDate - dateSec;
    const blocks = +(dateDif / avg).toFixed(0)
    const curBlock = await provider.getBlockNumber();
    return curBlock - blocks;
  }

  public static async extendStrategyName(provider: ethers.providers.Provider, strategy: string, strategyName: string) {
    if (strategyName === 'ImpermaxBaseStrategy') {
      return 'Impermax_' + await Utils.impermaxName(provider, strategy);
    } else {
      return strategyName;
    }
  }

  public static async impermaxName(provider: ethers.providers.Provider, strategy: string) {
    try {
      const pool = await ImpermaxStrat__factory.connect(strategy, provider).pool();
      const collateral = await ImpermaxBorrowable__factory.connect(pool, provider).collateral();
      const vault = await ImpermaxCollateral__factory.connect(collateral, provider).underlying();
      const lpAdr = await ImpermaxVault__factory.connect(vault, provider).underlying();
      const lp = Lp__factory.connect(lpAdr, provider);
      const lpName = await lp.name();
      const t0 = await lp.token0();
      const t0Name = await Erc20__factory.connect(t0, provider).symbol();
      const t1 = await lp.token1();
      const t1Name = await Erc20__factory.connect(t1, provider).symbol();
      return `${lpName.replace(' ', '')}_${t0Name}_${t1Name}`;
    } catch (e) {
      console.log('error get name for ', strategy);
      return 'ERROR';
    }
  }

  static async impermaxUtilization(strategy: string, provider: ethers.providers.Provider, dec: number): Promise<[string, number, number]> {
    const name = await Strategy__factory.connect(strategy, provider).STRATEGY_NAME();
    if (name !== 'ImpermaxBaseStrategy') {
      return ['0', 0, 0];
    }
    const pool = await ImpermaxStrat__factory.connect(strategy, provider).pool();
    const borrowable = ImpermaxBorrowable__factory.connect(pool, provider);
    const borrowed = +utils.formatUnits(await borrowable.totalBorrows(), dec);
    // console.log('borrowed', borrowed)
    const supply = +utils.formatUnits(await borrowable.totalBalance(), dec) + borrowed;
    // console.log('supply', supply)
    return [(borrowed / supply * 100).toFixed(0), borrowed, supply]
  }

  static async impermaxBorrowRate(strategy: string, provider: ethers.providers.Provider, dec: number) {
    const name = await Strategy__factory.connect(strategy, provider).STRATEGY_NAME();
    if (name !== 'ImpermaxBaseStrategy') {
      return 0;
    }
    const pool = await ImpermaxStrat__factory.connect(strategy, provider).pool();
    const borrowable = ImpermaxBorrowable__factory.connect(pool, provider);
    return +utils.formatUnits(await borrowable.borrowRate(), 9)
  }

  static async lastRebalanceEvent(
    provider: ethers.providers.Provider,
    splitter: string
  ): Promise<TypedEvent<[string] & { strategy: string }> | null> {
    const curBlock = await provider.getBlockNumber();
    const events =  await Utils.rebalanceEvent(provider, splitter, curBlock - FIND_EVENTS_STEP, curBlock);
    if(events.length === 0) {
      return null;
    }
    let event = events[0];
    for(const e of events) {
      if(event.blockNumber < e.blockNumber) {
        event = e;
      }
    }
    return event;
  }

  static async rebalanceEvent(
    provider: ethers.providers.Provider,
    splitter: string,
    from: number,
    to: number
  ): Promise<TypedEvent<[string] & { strategy: string }>[]> {
    console.log('find rebalance events', splitter, from, to)
    const s = Splitter__factory.connect(splitter, provider);
    const event = s.filters.Rebalance();
    const events = await s.queryFilter(event, from, to);
    const startBlock = await Utils.getBlockByDate((await s.created()).toNumber(), provider);
    if (events.length !== 0 || from < startBlock) {
      console.log('rebalance events found')
      return events;
    }
    return Utils.rebalanceEvent(provider, splitter, from - FIND_EVENTS_STEP, from);
  }

  static async lastRatioAdjustEvent(
    provider: ethers.providers.Provider,
    splitter: string
  ): Promise<TypedEvent<[string, ethers.BigNumber] & {strategy: string, ratio: ethers.BigNumber}> | null> {
    const curBlock = await provider.getBlockNumber();
    const events =  await Utils.ratioAdjustEvent(provider, splitter, curBlock - FIND_EVENTS_STEP, curBlock);
    if(events.length === 0) {
      return null;
    }
    let event = events[0];
    for(const e of events) {
      if(event.blockNumber < e.blockNumber) {
        event = e;
      }
    }
    return event;
  }

  static async ratioAdjustEvent(
    provider: ethers.providers.Provider,
    splitter: string,
    from: number,
    to: number
  ): Promise<TypedEvent<[string, ethers.BigNumber] & {strategy: string, ratio: ethers.BigNumber}>[]> {
    console.log('find RatioAdjust events', splitter, from, to)
    const s = Splitter__factory.connect(splitter, provider);
    const event = s.filters.StrategyRatioChanged();
    const events = await s.queryFilter(event, from, to);
    const startBlock = await Utils.getBlockByDate((await s.created()).toNumber(), provider);
    if (events.length !== 0 || from < startBlock) {
      console.log('RatioAdjust events found')
      return events;
    }
    return Utils.ratioAdjustEvent(provider, splitter, from - FIND_EVENTS_STEP, from);
  }
}
