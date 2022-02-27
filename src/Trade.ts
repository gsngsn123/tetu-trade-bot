import {Config} from "./Config";
import {
  Erc20__factory,
  Factory__factory,
  Lp,
  Lp__factory,
  Router__factory,
  TradeBot__factory
} from "../types/ethers-contracts";
import {BigNumber, ethers, utils} from "ethers";
import {Utils} from "./Utils";

require('dotenv').config();

export class Trade {

  static async start() {
    console.log('!!!!!!!!!START TRADE BOT!!!!!!!!!!!');
    const config = new Config();
    const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
    const signer = new ethers.Wallet(config.privateKey, provider);
    console.log("signer", signer.address);
    console.log("bot", config.bot);

    const bot = TradeBot__factory.connect(config.bot, signer);

    const position = await bot.positions(config.positionOwner);
    if (position.owner.toLowerCase() !== config.positionOwner.toLowerCase()) {
      console.log("NO POSITION for owner", config.positionOwner);
      return;
    }
    const positionAmount = process.env.AMOUNT as string
    const tradeDelay = Number.parseInt(process.env.TRADE_DELAY as string)

    const tokenIn = position.tokenIn;
    const tokenOut = position.tokenOut;
    const factory = Factory__factory.connect(await Router__factory.connect(position.router, signer).factory(), signer);
    const pair = Lp__factory.connect(await factory.getPair(tokenIn, tokenOut), signer);
    const token0 = await pair.token0();
    const token1 = await pair.token1();
    const token0Decimals = await Erc20__factory.connect(token0, signer).decimals();
    const token1Decimals = await Erc20__factory.connect(token1, signer).decimals();
    const tokenInDecimals = await Erc20__factory.connect(tokenIn, signer).decimals();
    const tokenOutDecimals = await Erc20__factory.connect(tokenOut, signer).decimals();

    // noinspection InfiniteLoopJS
    while (true) {
      let tradesLength = (await bot.tradesLength(config.positionOwner)).toNumber();
      if (tradesLength !== 0) {
        const lastTrade = await bot.trades(config.positionOwner, tradesLength - 1);
        const now = Math.floor(Date.now() / 1000);
        const sinceLastCall = now - lastTrade.tradeTime.toNumber();
        if (sinceLastCall < tradeDelay) {
          console.log('trade delay', (sinceLastCall / 60 / 60).toFixed(2));
          await Utils.delay(60_000);
          continue;
        }
      }

      const curPos = await bot.positions(config.positionOwner);
      const tokenInBalance = curPos.tokenInAmount;

      if (curPos.tokenInAmount.lt(BigNumber.from(positionAmount))) {
        console.error('NOT ENOUGH FUNDS! probably we bought what we wanted')
        return;
      }

      const [price, reserve0, reserve1] = await computePrice(pair, tokenOut, token0, token0Decimals, token1Decimals);

      console.log('price', price);

      // todo price check settings

      const gasPrice = await Utils.getCurrentGas(signer.provider);
      await Utils.runAndWait(signer.provider,
        () => bot.execute(config.positionOwner, positionAmount,
          {
            gasLimit: 9_000_000,
            gasPrice: (gasPrice * 1.2).toFixed(0)
          })
      );

      tradesLength = (await bot.tradesLength(config.positionOwner)).toNumber();
      const trade = await bot.trades(config.positionOwner, tradesLength - 1);

      console.log('------------ TRADE ---------------')
      console.log('Price: ', utils.formatUnits(trade.price))
      console.log('TokenIn: ', utils.formatUnits(trade.tokenInAmount, tokenInDecimals))
      console.log('TokenOut: ', utils.formatUnits(trade.tokenOutAmount, tokenOutDecimals))
      console.log('----------------------------------')

      await Utils.delay(60_000);
    }
  }

}


async function computePrice(
  lp: Lp,
  targetToken: string,
  token0: string,
  token0Decimals: number,
  token1Decimals: number
): Promise<[number, number, number]> {
  const reserves = await lp.getReserves();
  const reserve0 = +utils.formatUnits(reserves[0], token0Decimals);
  const reserve1 = +utils.formatUnits(reserves[1], token1Decimals);

  if (token0.toLowerCase() === targetToken.toLowerCase()) {
    return [reserve1 / reserve0, reserve1, reserve0];
  } else {
    return [reserve0 / reserve1, reserve0, reserve1];
  }
}
