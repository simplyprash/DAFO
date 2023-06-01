import { Block } from '@ethersproject/abstract-provider';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { ethers, network } from 'hardhat';
import ImageData from '../files/dafo-image-data.json';
import {
  DafoCustomizer,
  DafoCustomizer__factory as DafoCustomizerFactory,
  DafoDescriptor,
  DafoDescriptor__factory as DafoDescriptorFactory,
  DafoToken,
  DafoToken__factory as DafoTokenFactory,
  Weth,
  Weth__factory as WethFactory,
} from '../typechain';

export type TestSigners = {
  deployer: SignerWithAddress;
  account0: SignerWithAddress;
  account1: SignerWithAddress;
  account2: SignerWithAddress;
};

export const getSigners = async (): Promise<TestSigners> => {
  const [deployer, account0, account1, account2] = await ethers.getSigners();
  return {
    deployer,
    account0,
    account1,
    account2,
  };
};

export const deployDafoDescriptor = async (deployer?: SignerWithAddress): Promise<DafoDescriptor> => {
  const signer = deployer || (await getSigners()).deployer;
  const nftDescriptorLibraryFactory = await ethers.getContractFactory('NFTDescriptor', signer);
  const nftDescriptorLibrary = await nftDescriptorLibraryFactory.deploy();
  const dafoDescriptorFactory = new DafoDescriptorFactory(
    {
      __$e1d8844a0810dc0e87a665b1f2b5fa7c69$__: nftDescriptorLibrary.address,
    },
    signer
  );

  return dafoDescriptorFactory.deploy();
};

export const deployDafoCustomizer = async (deployer?: SignerWithAddress): Promise<DafoCustomizer> => {
  const factory = new DafoCustomizerFactory(deployer || (await getSigners()).deployer);

  return factory.deploy();
};

export const deployDafoToken = async (
  deployer?: SignerWithAddress,
  dafoundersDAO?: string,
  minter?: string,
  descriptor?: string,
  customizer?: string,
  proxyRegistryAddress?: string
): Promise<DafoToken> => {
  const signer = deployer || (await getSigners()).deployer;
  const factory = new DafoTokenFactory(signer);

  return factory.deploy(
    dafoundersDAO || signer.address,
    minter || signer.address,
    signer.address,
    descriptor || (await deployDafoDescriptor(signer)).address,
    customizer || (await deployDafoCustomizer(signer)).address,
    proxyRegistryAddress || address(0)
  );
};

export const deployWeth = async (deployer?: SignerWithAddress): Promise<Weth> => {
  const factory = new WethFactory(deployer || (await await getSigners()).deployer);

  return factory.deploy();
};

export const populateDescriptor = async (dafoDescriptor: DafoDescriptor): Promise<void> => {
  const { digits, palettes, roles } = ImageData;

  // Split up head and accessory population due to high gas usage
  await Promise.all([
    dafoDescriptor.addManyDigits(digits),
    dafoDescriptor.addManyRoles(roles),
    dafoDescriptor.addManyPalettes(palettes),
  ]);
};

/**
 * Return a function used to mint `amount` Dafos on the provided `token`
 * @param token The Dafo ERC721 token
 * @param amount The number of Dafos to mint
 */
export const MintDafos = (
  token: DafoToken,
  customizer: DafoCustomizer,
  burnDafoundersTokens = true
): ((amount: number) => Promise<void>) => {
  return async (amount: number): Promise<void> => {
    let customInfo;
    for (let i = 0; i < amount; i++) {
      customInfo = await customizer.create(i, 0, 0, false);
      await token.mint(customInfo, address(0));
    }
    if (!burnDafoundersTokens) return;

    await setTotalSupply(token, customizer, amount);
  };
};

/**
 * Mints or burns tokens to target a total supply. Due to Dafounders' rewards tokens may be burned and tokenIds will not be sequential
 */
export const setTotalSupply = async (
  token: DafoToken,
  customizer: DafoCustomizer,
  newTotalSupply: number
): Promise<void> => {
  const totalSupply = (await token.totalSupply()).toNumber();
  let customInput;
  if (totalSupply < newTotalSupply) {
    for (let i = 0; i < newTotalSupply - totalSupply; i++) {
      customInput = await customizer.create(i, 0, 0, false);
      await token.mint(customInput, address(0));
    }
    // If Dafounder's reward tokens were minted totalSupply will be more than expected, so run setTotalSupply again to burn extra tokens
    await setTotalSupply(token, customizer, newTotalSupply);
  }

  if (totalSupply > newTotalSupply) {
    for (let i = newTotalSupply; i < totalSupply; i++) {
      await token.burn(i);
    }
  }
};

// The following adapted from `https://github.com/compound-finance/compound-protocol/blob/master/tests/Utils/Ethereum.js`

const rpc = <T = unknown>({ method, params }: { method: string; params?: unknown[] }): Promise<T> => {
  return network.provider.send(method, params);
};

export const encodeParameters = (types: string[], values: unknown[]): string => {
  const abi = new ethers.utils.AbiCoder();
  return abi.encode(types, values);
};

export const blockByNumber = async (n: number | string): Promise<Block> => {
  return rpc({ method: 'eth_getBlockByNumber', params: [n, false] });
};

export const increaseTime = async (seconds: number): Promise<unknown> => {
  await rpc({ method: 'evm_increaseTime', params: [seconds] });
  return rpc({ method: 'evm_mine' });
};

export const freezeTime = async (seconds: number): Promise<unknown> => {
  await rpc({ method: 'evm_increaseTime', params: [-1 * seconds] });
  return rpc({ method: 'evm_mine' });
};

export const advanceBlocks = async (blocks: number): Promise<void> => {
  for (let i = 0; i < blocks; i++) {
    await mineBlock();
  }
};

export const blockNumber = async (parse = true): Promise<number> => {
  const result = await rpc<number>({ method: 'eth_blockNumber' });
  return parse ? parseInt(result.toString()) : result;
};

export const blockTimestamp = async (n: number | string, parse = true): Promise<number | string> => {
  const block = await blockByNumber(n);
  return parse ? parseInt(block.timestamp.toString()) : block.timestamp;
};

export const setNextBlockTimestamp = async (n: number, mine = true): Promise<void> => {
  await rpc({ method: 'evm_setNextBlockTimestamp', params: [n] });
  if (mine) await mineBlock();
};

export const minerStop = async (): Promise<void> => {
  await network.provider.send('evm_setAutomine', [false]);
  await network.provider.send('evm_setIntervalMining', [0]);
};

export const minerStart = async (): Promise<void> => {
  await network.provider.send('evm_setAutomine', [true]);
};

export const mineBlock = async (): Promise<void> => {
  await network.provider.send('evm_mine');
};

export const chainId = async (): Promise<number> => {
  return parseInt(await network.provider.send('eth_chainId'), 16);
};

export const address = (n: number): string => {
  return `0x${n.toString(16).padStart(40, '0')}`;
};