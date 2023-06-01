import { utils } from 'ethers';
import { task, types } from 'hardhat/config';

task('create-proposal', 'Create a governance proposal')
  .addOptionalParam(
    'nounsDaoProxy',
    'The `NounsDAOProxy` contract address',
    '0x76422049fA4fDFbCDE48457bedC67d8f8e047a6B',
    types.string,
  )
  .setAction(async ({ nounsDaoProxy }, { ethers }) => {
    const nounsDaoFactory = await ethers.getContractFactory('NounsDAOLogicV1');
    const nounsDao = nounsDaoFactory.attach(nounsDaoProxy);

    const [deployer] = await ethers.getSigners();
    const oneETH = utils.parseEther('1');

    const receipt = await (
      await nounsDao.propose(
        [deployer.address],
        [oneETH],
        [''],
        ['0x'],
        '# Test Proposal\n## This is a **test**.',
      )
    ).wait();
    if (!receipt.events?.length) {
      throw new Error('Failed to create proposal');
    }
    console.log('Proposal created');
  });
