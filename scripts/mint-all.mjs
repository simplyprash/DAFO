// @ts-check
import { ethers } from 'ethers';
import allowList from './allow-list.mjs';
import dafoTokenAbi from './dafo-token-abi.mjs';
import { build } from './input-builder.mjs';

const validList = allowList.filter((mint, i) => {
  try {
    ethers.utils.getAddress(mint.walletId);
    build(mint);
    return true;
  } catch (e) {
    console.error(i, mint, e);
    return false;
  }
});

console.error(`minting ${validList.length} tokens`);

if (!process.env.WALLET_PRIVATE_KEY) {
  console.error('ERROR', 'no wallet provided');
  process.exit(1);
}

const provider = new ethers.providers.JsonRpcProvider('https://mainnet.infura.io/v3/a5502d2585024b72a5705deb7665e985');
const wallet = new ethers.Wallet(process.env.WALLET_PRIVATE_KEY, provider);

/**
 * @type {import('../typechain/DafoToken').DafoToken}
 */
const dafoToken = new ethers.Contract('0xDad912c673F675e7cDA7eeA5931BeB189001dd8e', dafoTokenAbi, wallet);

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function mintAll() {
  const list = validList.slice(0, 55);

  list.forEach(async ({ tokenId, role, style, walletId }, i) => {
    await sleep(7000 * i);
    if ((await dafoToken.findNextAvailable(tokenId)) !== tokenId) {
      console.log('ERROR', `tokenId ${tokenId} is not available`);
      return;
    }
    console.log(new Date(), `minting ${JSON.stringify({ tokenId, role, style, walletId })}`);
    try {
      const tx = await dafoToken.mint({ ...build({ role, style }), tokenId }, walletId);
      console.log(new Date(), `minted token ${tokenId}: https://etherscan.io/tx/${tx.hash}`);
      console.error(new Date(), `minted token ${tokenId}: https://etherscan.io/tx/${tx.hash}`);
    } catch (e) {
      console.log('CRITICAL', tokenId, e);
    }
  });
}

await mintAll();
