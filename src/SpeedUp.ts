import axios, {AxiosResponse} from "axios";
import {Config} from "./Config";
import Web3 from 'web3';
import {ethers} from "ethers";
import {Utils} from "./Utils";

const EthereumTx = require('ethereumjs-tx').Transaction;


export class SpeedUp {


  public static async speedUp(txHash: string, provider: ethers.providers.Provider, addNonce = 0): Promise<string> {
    console.log('SPEEDUP', txHash)
    const config = new Config();

    const web3 = new Web3(new Web3.providers.HttpProvider(config.rpcUrl, {
      keepAlive: true,
      timeout: 120000, // ms
    }));

    let response: AxiosResponse;
    try {
      response = await axios.post(config.rpcUrl,
        `{"jsonrpc":"2.0","method":"eth_getTransactionByHash","params":["${txHash}"],"id":1}`,
        {
          headers: {
            'Content-Type': 'application/json',
          }
        },
      );
    } catch (e) {
      console.error('error request', e);
      return 'error';
    }
    const result = response.data.result;
    // console.log('response', txHash, result);
    if (!result) {
      console.error('tx for speedup receipt is empty!', response)
      return 'error';
    }

    const nonce = Web3.utils.hexToNumber(result.nonce); // + addNonce probably will require for some cases but now we are dropping all if have error
    console.log('nonce', nonce);

    const gasPrice = await Utils.getCurrentGas(provider);
    const gasPriceAdjusted = +(gasPrice * 2).toFixed(0);

    console.log('current gas', gasPrice, gasPriceAdjusted, Web3.utils.numberToHex(gasPriceAdjusted));

    const chain = await Utils.getChainConfig(provider);
    const limit = await Utils.getBlockGasLimit(provider);
    const tx = new EthereumTx(
      {
        nonce: Web3.utils.numberToHex(nonce),
        from: result.from,
        to: result.to,
        data: result.input,
        gasPrice: gasPriceAdjusted,
        gasLimit: Web3.utils.numberToHex(limit),
      },
      {common: chain});


    tx.sign(Buffer.from(config.privateKey, 'hex'));

    const txRaw = '0x' + tx.serialize().toString('hex');

    let newHash = '';

    try {
      await web3.eth.sendSignedTransaction(txRaw, (err, res) => {
        console.log('SpeedUp tx result', err, res);
        newHash = res;
      });
    } catch (e) {
      console.log('speedup tx error', e);
      await SpeedUp.dropPending()
    }

    console.log('start waiting speedup result');
    while (newHash === '') {
      console.log('wait speedup result')
      await Utils.delay(10000);
    }
    console.log('speed up result hash', newHash);
    return newHash;
  }

  public static async dropPending() {
    const config = new Config();

    const web3 = new Web3(new Web3.providers.HttpProvider(config.rpcUrl, {
      keepAlive: true,
      timeout: 120000, // ms
    }));
    const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
    const signer = new ethers.Wallet(config.privateKey, provider);
    console.log('Drop all pending txs', signer.address)

    while (true) {
      const nonce = await web3.eth.getTransactionCount(signer.address)
      console.log('nonce', nonce.toString());
      const nonce1 = await web3.eth.getTransactionCount(signer.address, 'pending')
      console.log('pending nonce', nonce1.toString());
      if (nonce1 === nonce) {
        console.log('NO PENDING');
        return;
      }
      try {
        const gasPrice = await Utils.getCurrentGas(provider);
        const gasPriceAdjusted = +(gasPrice * 3).toFixed(0);

        const chain = await Utils.getChainConfig(provider);
        const limit = await Utils.getBlockGasLimit(provider);
        console.log('current gas', gasPrice, gasPriceAdjusted);
        const tx = new EthereumTx(
          {
            nonce: web3.utils.numberToHex(nonce),
            from: signer.address,
            to: signer.address,
            // data: result.input,
            gasPrice: web3.utils.numberToHex(gasPriceAdjusted),
            gasLimit: web3.utils.numberToHex(limit),
          },
          {common: chain});


        tx.sign(Buffer.from(config.privateKey, 'hex'));

        const txRaw = '0x' + tx.serialize().toString('hex');

        await web3.eth.sendSignedTransaction(txRaw, (err, res) => {
          console.log('result', err, res);
        });
      } catch (e) {
        console.log('error drop pedning loop', e);
      }
    }
  }

}
