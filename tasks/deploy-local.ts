import { Contract as EthersContract } from 'ethers';
import { Interface } from 'ethers/lib/utils';
import { task, types } from 'hardhat/config';
import { default as DafoAuctionHouseABI } from '../abi/contracts/DafoAuctionHouse.sol/DafoAuctionHouse.json';

type ContractName =
  | 'WETH'
  | 'NFTDescriptor'
  | 'DafoDescriptor'
  | 'DafoCustomizer'
  | 'DafoToken'
  | 'DafoAuctionHouse'
  | 'DafoAuctionHouseProxyAdmin'
  | 'DafoAuctionHouseProxy'
  | 'NounsDAOExecutor'
  | 'NounsDAOLogicV1'
  | 'NounsDAOProxy';

interface Contract {
  args?: (string | number | (() => string | undefined))[];
  instance?: EthersContract;
  libraries?: () => Record<string, string>;
  waitForConfirmation?: boolean;
}

task('deploy-local', 'Deploy contracts to hardhat')
  .addOptionalParam('noundersdao', 'The nounders DAO contract address')
  .addOptionalParam('auctionTimeBuffer', 'The auction time buffer (seconds)', 30, types.int) // Default: 30 seconds
  .addOptionalParam('auctionReservePrice', 'The auction reserve price (wei)', 25000000000000000, types.int) // Default: 1 wei
  .addOptionalParam(
    'auctionMinIncrementBidPercentage',
    'The auction min increment bid percentage (out of 100)', // Default: 5%
    5,
    types.int
  )
  .addOptionalParam('auctionDuration', 'The auction duration (seconds)', 60 * 2, types.int) // Default: 2 minutes
  .addOptionalParam('timelockDelay', 'The timelock delay (seconds)', 60 * 60 * 24 * 2, types.int) // Default: 2 days
  .addOptionalParam('votingPeriod', 'The voting period (blocks)', 4 * 60 * 24 * 3, types.int) // Default: 3 days
  .addOptionalParam('votingDelay', 'The voting delay (blocks)', 1, types.int) // Default: 1 block
  .addOptionalParam('proposalThresholdBps', 'The proposal threshold (basis points)', 500, types.int) // Default: 5%
  .addOptionalParam('quorumVotesBps', 'Votes required for quorum (basis points)', 1_000, types.int) // Default: 10%
  .setAction(async (args, { ethers }) => {
    const network = await ethers.provider.getNetwork();
    if (network.chainId !== 31337) {
      console.log(`Invalid chain id. Expected 31337. Got: ${network.chainId}.`);
      return;
    }

    const proxyRegistryAddress = '0xa5409ec958c83c3f309868babaca7c86dcb077c1';

    const AUCTION_HOUSE_PROXY_NONCE_OFFSET = 7;
    const GOVERNOR_N_DELEGATOR_NONCE_OFFSET = 10;

    const [deployer] = await ethers.getSigners();
    const nonce = await deployer.getTransactionCount();
    const expectedNounsDAOProxyAddress = ethers.utils.getContractAddress({
      from: deployer.address,
      nonce: nonce + GOVERNOR_N_DELEGATOR_NONCE_OFFSET,
    });
    const expectedAuctionHouseProxyAddress = ethers.utils.getContractAddress({
      from: deployer.address,
      nonce: nonce + AUCTION_HOUSE_PROXY_NONCE_OFFSET,
    });
    const contracts: Record<ContractName, Contract> = {
      WETH: {},
      NFTDescriptor: {},
      DafoDescriptor: {
        libraries: () => ({
          NFTDescriptor: contracts['NFTDescriptor'].instance?.address as string,
        }),
      },
      DafoCustomizer: {},
      DafoToken: {
        args: [
          args.noundersdao || deployer.address,
          expectedAuctionHouseProxyAddress,
          () => contracts['DafoDescriptor'].instance?.address,
          () => contracts['DafoCustomizer'].instance?.address,
          proxyRegistryAddress,
        ],
      },
      DafoAuctionHouse: {
        waitForConfirmation: true,
      },
      DafoAuctionHouseProxyAdmin: {},
      DafoAuctionHouseProxy: {
        args: [
          () => contracts['DafoAuctionHouse'].instance?.address,
          () => contracts['DafoAuctionHouseProxyAdmin'].instance?.address,
          () =>
            new Interface(DafoAuctionHouseABI).encodeFunctionData('initialize', [
              contracts['DafoToken'].instance?.address,
              contracts['DafoCustomizer'].instance?.address,
              contracts['DafoDescriptor'].instance?.address,
              contracts['WETH'].instance?.address,
              args.auctionTimeBuffer,
              args.auctionReservePrice,
              args.auctionMinIncrementBidPercentage,
              args.auctionDuration,
            ]),
        ],
      },
      NounsDAOExecutor: {
        args: [expectedNounsDAOProxyAddress, args.timelockDelay],
      },
      NounsDAOLogicV1: {
        waitForConfirmation: true,
      },
      NounsDAOProxy: {
        args: [
          () => contracts['NounsDAOExecutor'].instance?.address,
          () => contracts['DafoToken'].instance?.address,
          args.noundersdao || deployer.address,
          () => contracts['NounsDAOExecutor'].instance?.address,
          () => contracts['NounsDAOLogicV1'].instance?.address,
          args.votingPeriod,
          args.votingDelay,
          args.proposalThresholdBps,
          args.quorumVotesBps,
        ],
      },
    };

    for (const [name, contract] of Object.entries(contracts)) {
      const factory = await ethers.getContractFactory(name, {
        libraries: contract?.libraries?.(),
      });

      const deployedContract = await factory.deploy(
        ...(contract.args?.map((a) => (typeof a === 'function' ? a() : a)) ?? [])
      );

      if (contract.waitForConfirmation) {
        await deployedContract.deployed();
      }

      contracts[name as ContractName].instance = deployedContract;

      console.log(`${name} contract deployed to ${deployedContract.address}`);
    }

    return contracts;
  });
