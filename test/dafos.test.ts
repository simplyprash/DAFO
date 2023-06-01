import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import chai from 'chai';
import { solidity } from 'ethereum-waffle';
import { BigNumber, constants } from 'ethers';
import { ethers } from 'hardhat';
import { DafoCustomizer, DafoDescriptor__factory as DafoDescriptorFactory, DafoToken } from '../typechain';
import { deployDafoCustomizer, deployDafoToken, populateDescriptor } from './utils';

chai.use(solidity);
const { expect } = chai;

describe('DafoToken', () => {
  let dafoToken: DafoToken;
  let dafoCustomizer: DafoCustomizer;
  let deployer: SignerWithAddress;
  let dafoundersDAO: SignerWithAddress;
  let snapshotId: number;

  before(async () => {
    [deployer, dafoundersDAO] = await ethers.getSigners();
    dafoToken = await deployDafoToken(deployer, dafoundersDAO.address, deployer.address);
    dafoCustomizer = await deployDafoCustomizer(deployer);

    const descriptor = await dafoToken.descriptor();

    await populateDescriptor(DafoDescriptorFactory.connect(descriptor, deployer));
  });

  beforeEach(async () => {
    snapshotId = await ethers.provider.send('evm_snapshot', []);
  });

  afterEach(async () => {
    await ethers.provider.send('evm_revert', [snapshotId]);
  });

  it('should allow the minter to mint a dafo to itself and a reward dafo to the dafoundersDAO', async () => {
    const customInput = await dafoCustomizer.create(1, 0, 0, false);
    const receipt = await (await dafoToken.mint(customInput, deployer.address)).wait();

    const [, , , dafosDafoCreated, , , , ownersDafoCreated] = receipt.events || [];

    expect(await dafoToken.ownerOf(1)).to.eq(deployer.address);
    expect(dafosDafoCreated?.event).to.eq('DafoCreated');
    expect(dafosDafoCreated?.args?.tokenId).to.eq(1);
    expect(dafosDafoCreated?.args?.customInput.length).to.equal(4);

    const availableDafoundersToken = ownersDafoCreated?.args?.tokenId;
    expect(ownersDafoCreated?.event).to.eq('DafoCreated');
    expect(await dafoToken.ownerOf(availableDafoundersToken)).to.eq(dafoundersDAO.address);
    expect(ownersDafoCreated?.args?.customInput.length).to.equal(4);

    ownersDafoCreated?.args?.customInput.forEach((item: BigNumber | number | boolean) => {
      if (typeof item !== 'boolean') {
        const value = typeof item !== 'number' ? item?.toNumber() : item;
        expect(value).to.be.a('number');
      } else {
        expect(item).to.be.a('boolean');
      }
    });

    dafosDafoCreated?.args?.customInput.forEach((item: BigNumber | number) => {
      if (typeof item !== 'boolean') {
        const value = typeof item !== 'number' ? item?.toNumber() : item;
        expect(value).to.be.a('number');
      } else {
        expect(item).to.be.a('boolean');
      }
    });
  });

  it('should set symbol', async () => {
    expect(await dafoToken.symbol()).to.eq('DAFO');
  });

  it('should set name', async () => {
    expect(await dafoToken.name()).to.eq('Dafo');
  });

  it('should allow minter to mint a dafo to itself', async () => {
    const customInput = await dafoCustomizer.create(2, 0, 0, false);

    const receipt = await (await dafoToken.mint(customInput, deployer.address)).wait();
    const dafoCreated = receipt.events?.[3];

    expect(await dafoToken.ownerOf(2)).to.eq(deployer.address);
    expect(dafoCreated?.event).to.eq('DafoCreated');
    expect(dafoCreated?.args?.tokenId).to.eq(2);
    expect(dafoCreated?.args?.customInput.length).to.equal(4);

    dafoCreated?.args?.customInput.forEach((item: BigNumber | number | boolean) => {
      if (typeof item !== 'boolean') {
        const value = typeof item !== 'number' ? item?.toNumber() : item;
        expect(value).to.be.a('number');
      } else {
        expect(item).to.be.a('boolean');
      }
    });
  });

  it('should emit two transfer logs on mint', async () => {
    const [, , creator, minter] = await ethers.getSigners();
    const first_custom_data = await dafoCustomizer.create(1, 0, 0, false);
    const second_custom_data = await dafoCustomizer.create(2, 0, 0, false);
    await (await dafoToken.mint(first_custom_data, deployer.address)).wait();

    await (await dafoToken.setMinter(minter.address)).wait();
    await (await dafoToken.transferOwnership(creator.address)).wait();

    const tx = dafoToken.connect(minter).mint(second_custom_data, minter.address);

    await expect(tx).to.emit(dafoToken, 'Transfer').withArgs(constants.AddressZero, creator.address, 2);
    await expect(tx).to.emit(dafoToken, 'Transfer').withArgs(creator.address, minter.address, 2);
  });

  it('should allow minter to burn a dafo', async () => {
    const customInput = await dafoCustomizer.create(1, 0, 0, false);
    await (await dafoToken.mint(customInput, deployer.address)).wait();

    const tx = dafoToken.burn(1);
    await expect(tx).to.emit(dafoToken, 'DafoBurned').withArgs(1);
  });

  it('should revert on non-minter mint', async () => {
    const customInput = await dafoCustomizer.create(1, 0, 0, false);
    const account0AsNounErc721Account = dafoToken.connect(dafoundersDAO);
    await expect(account0AsNounErc721Account.mint(customInput, deployer.address)).to.be.reverted;
  });

  it('should have a royalty of 5 percent ', async () => {
    const customInput = await dafoCustomizer.create(2, 0, 0, false);

    await (await dafoToken.mint(customInput, deployer.address)).wait();

    const royaltyInfo = await dafoToken.royaltyInfo(2, 100);
    const royaltyAmount = royaltyInfo[1]._hex;
    expect(royaltyAmount).equals('0x05');
  });

  it('should have existing tokenId 0', async () => {
    const isExists = await dafoToken.exists(0);
    expect(isExists).equals(true);
  });

  it('should revert on minting tokenId 0', async () => {
    const customInput = await dafoCustomizer.create(0, 0, 0, false);

    const tx = dafoToken.mint(customInput, deployer.address);

    await expect(tx).to.be.revertedWith('DafoToken: Token cannot be lower than 1 or greater than 10 000');
  });

  it('should revert on minting tokenId greater than 10000', async () => {
    const customInput = await dafoCustomizer.create(10001, 0, 0, false);

    const tx = dafoToken.mint(customInput, deployer.address);

    await expect(tx).to.be.revertedWith('DafoToken: Token cannot be lower than 1 or greater than 10 000');
  });

  it('should implement IERC2981', async () => {
    const customInput = await dafoCustomizer.create(2, 0, 0, false);

    await (await dafoToken.mint(customInput, deployer.address)).wait();

    const isImplemented = await dafoToken.supportsInterface('0x2a55205a');

    expect(isImplemented).to.be.true;
  });

  describe('contractURI', async () => {
    it('should return correct contractURI', async () => {
      expect(await dafoToken.contractURI()).to.eq(
        'ipfs://bafybeicicxtkwszk2gsuyawuecf2quhaokqut6steoiquv5j63wc2wsxm4/contract-uri.json'
      );
    });
    it('should allow owner to set contractURI', async () => {
      await dafoToken.setContractURIHash('ABC123');
      expect(await dafoToken.contractURI()).to.eq('ipfs://ABC123');
    });
    it('should not allow non owner to set contractURI', async () => {
      const [, nonOwner] = await ethers.getSigners();
      await expect(dafoToken.connect(nonOwner).setContractURIHash('BAD')).to.be.revertedWith(
        'Ownable: caller is not the owner'
      );
    });
  });
});
