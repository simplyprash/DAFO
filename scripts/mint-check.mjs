// @ts-check
import { ethers } from 'ethers';
import dafoTokenAbi from './dafo-token-abi.mjs';
import tokens from './day1-minted-tokens.mjs';

const provider = new ethers.providers.JsonRpcProvider('https://mainnet.infura.io/v3/a5502d2585024b72a5705deb7665e985');

/**
 * @type {import('../typechain/DafoToken').DafoToken}
 */
const dafoToken = new ethers.Contract('0xDad912c673F675e7cDA7eeA5931BeB189001dd8e', dafoTokenAbi, provider);

async function checkAll() {
  tokens.forEach(async (tokenId, i) => {
    console.log(tokenId, (await dafoToken.findNextAvailable(tokenId)) !== tokenId);
  });
}

await checkAll();
