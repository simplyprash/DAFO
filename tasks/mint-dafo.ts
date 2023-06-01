import { task, types } from 'hardhat/config';

task('mint-noun', 'Mints a Noun')
  .addOptionalParam(
    'dafoToken',
    'The `DafoToken` contract address',
    '0x9FFd15aA896303Be5F9FB04C8fC2469f6f948782',
    types.string
  )
  .setAction(async ({ nounsToken }, { ethers }) => {
    const nftFactory = await ethers.getContractFactory('DafoToken');
    const nftContract = nftFactory.attach(nounsToken);

    const receipt = await (await nftContract.mint()).wait();
    const nounCreated = receipt.events?.[1];
    const { tokenId } = nounCreated?.args;

    console.log(`Dafo minted with ID: ${tokenId.toString()}.`);
  });
