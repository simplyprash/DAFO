import { Interface } from 'ethers/lib/utils';
import { task, types } from 'hardhat/config';
import promptjs from 'prompt';
import { default as DafoAuctionHouseABI } from '../abi/contracts/DafoAuctionHouse.sol/DafoAuctionHouse.json';

promptjs.colors = false;
promptjs.message = '> ';
promptjs.delimiter = '';

type ContractName =
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
  address?: string;
  libraries?: () => Record<string, string>;
  waitForConfirmation?: boolean;
}

task('deploy', 'Deploys NFTDescriptor, DafoDescriptor, DafoCustomizer, and DafoToken')
  .addParam('dafoundersdao', 'The dafoundersdao DAO contract address', undefined, types.string)
  .addParam('weth', 'The WETH contract address', undefined, types.string)
  .addOptionalParam('auctionTimeBuffer', 'The auction time buffer (seconds)', 5 * 60, types.int)
  .addOptionalParam('auctionReservePrice', 'The auction reserve price (eth)', '0.025', types.string)
  .addOptionalParam(
    'auctionMinIncrementBidPercentage',
    'The auction min increment bid percentage (out of 100)',
    5,
    types.int
  )
  .addOptionalParam('auctionduration', 'The auction duration (seconds)', 60 * 60 * 24, types.int) // Default: 24 hours
  .addOptionalParam('timelockDelay', 'The timelock delay (seconds)', 60 * 60 * 24 * 2, types.int) // Default: 2 days
  .addOptionalParam('votingPeriod', 'The voting period (blocks)', 4 * 60 * 24 * 3, types.int) // Default: 3 days
  .addOptionalParam('votingDelay', 'The voting delay (blocks)', 1, types.int) // Default: 1 block
  .addOptionalParam('proposalThresholdBps', 'The proposal threshold (basis points)', 500, types.int) // Default: 5%
  .addOptionalParam('quorumVotesBps', 'Votes required for quorum (basis points)', 1_000, types.int) // Default: 10%
  .setAction(async (args, { ethers }) => {
    const network = await ethers.provider.getNetwork();
    let proxyRegistryAddress;

    if (network.chainId === 1) {
      proxyRegistryAddress = '0xa5409ec958c83c3f309868babaca7c86dcb077c1';
    } else if (network.chainId === 4) {
      proxyRegistryAddress = '0xf57b2c51ded3a29e6891aba85459d600256cf317';
    } else if (network.chainId === 80001) {
      proxyRegistryAddress = '0xff7Ca10aF37178BdD056628eF42fD7F799fAc77c';
    } else if (network.chainId === 137) {
      proxyRegistryAddress = '0x58807baD0B376efc12F5AD86aAc70E78ed67deaE';
    }

    const AUCTION_HOUSE_PROXY_NONCE_OFFSET = 6;
    const GOVERNOR_N_DELEGATOR_NONCE_OFFSET = 9;

    const [deployer] = await ethers.getSigners();
    const nonce = await deployer.getTransactionCount();
    const expectedAuctionHouseProxyAddress = ethers.utils.getContractAddress({
      from: deployer.address,
      nonce: nonce + AUCTION_HOUSE_PROXY_NONCE_OFFSET,
    });
    const expectedNounsDAOProxyAddress = ethers.utils.getContractAddress({
      from: deployer.address,
      nonce: nonce + GOVERNOR_N_DELEGATOR_NONCE_OFFSET,
    });
    const contracts: Record<ContractName, Contract> = {
      NFTDescriptor: {},
      DafoDescriptor: {
        libraries: () => ({
          NFTDescriptor: contracts['NFTDescriptor'].address as string,
        }),
      },
      DafoCustomizer: {},
      DafoToken: {
        args: [
          args.dafoundersdao,
          expectedAuctionHouseProxyAddress,
          deployer.address,
          () => contracts['DafoDescriptor'].address,
          () => contracts['DafoCustomizer'].address,
          proxyRegistryAddress,
        ],
      },
      DafoAuctionHouse: {
        waitForConfirmation: true,
      },
      DafoAuctionHouseProxyAdmin: {},
      DafoAuctionHouseProxy: {
        args: [
          () => contracts['DafoAuctionHouse'].address,
          () => contracts['DafoAuctionHouseProxyAdmin'].address,
          () =>
            new Interface(DafoAuctionHouseABI).encodeFunctionData('initialize', [
              contracts['DafoToken'].address,
              contracts['DafoCustomizer'].address,
              contracts['DafoDescriptor'].address,
              args.weth,
              args.auctionTimeBuffer,
              ethers.utils.parseEther(args.auctionReservePrice),
              args.auctionMinIncrementBidPercentage,
              args.auctionduration,
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
          () => contracts['NounsDAOExecutor'].address,
          () => contracts['DafoToken'].address,
          args.dafoundersdao,
          () => contracts['NounsDAOExecutor'].address,
          () => contracts['NounsDAOLogicV1'].address,
          args.votingPeriod,
          args.votingDelay,
          args.proposalThresholdBps,
          args.quorumVotesBps,
        ],
      },
    };

    let gasPrice = await ethers.provider.getGasPrice();
    const gasInGwei = Math.round(Number(ethers.utils.formatUnits(gasPrice, 'gwei')));

    promptjs.start();

    let result = await promptjs.get([
      {
        properties: {
          gasPrice: {
            type: 'integer',
            required: true,
            description: 'Enter a gas price (gwei)',
            default: gasInGwei,
          },
        },
      },
    ]);

    gasPrice = ethers.utils.parseUnits(result.gasPrice.toString(), 'gwei');

    for (const [name, contract] of Object.entries(contracts)) {
      const factory = await ethers.getContractFactory(name, {
        libraries: contract?.libraries?.(),
      });

      const deploymentGas = await factory.signer.estimateGas(
        factory.getDeployTransaction(...(contract.args?.map((a) => (typeof a === 'function' ? a() : a)) ?? []), {
          gasPrice,
        })
      );

      const deploymentCost = deploymentGas.mul(gasPrice);

      console.log(`Estimated cost to deploy ${name}: ${ethers.utils.formatUnits(deploymentCost, 'ether')} ETH`);

      result = await promptjs.get([
        {
          properties: {
            confirm: {
              type: 'string',
              description: 'Type "DEPLOY" to confirm:',
            },
          },
        },
      ]);

      if (result.confirm != 'DEPLOY') {
        console.log('Exiting');
        return;
      }

      console.log('Deploying...');

      const deployedContract = await factory.deploy(
        ...(contract.args?.map((a) => (typeof a === 'function' ? a() : a)) ?? []),
        {
          gasPrice,
        }
      );

      if (contract.waitForConfirmation) {
        await deployedContract.deployed();
      }

      contracts[name as ContractName].address = deployedContract.address;

      console.log(`${name} contract deployed to ${deployedContract.address}`);
    }

    return contracts;
  });
