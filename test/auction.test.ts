import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import chai from 'chai';
import { solidity } from 'ethereum-waffle';
import { constants } from 'ethers';
import { ethers, upgrades } from 'hardhat';
import {
  DafoAuctionHouse,
  DafoCustomizer,
  DafoDescriptor__factory as DafoDescriptorFactory,
  DafoToken,
  MaliciousBidder__factory as MaliciousBidderFactory,
  Weth,
} from '../typechain';
import { deployDafoCustomizer, deployDafoToken, deployWeth, populateDescriptor } from './utils';

chai.use(solidity);
const { expect } = chai;

describe('DafoAuctionHouse', () => {
  let dafoAuctionHouse: DafoAuctionHouse;
  let dafoToken: DafoToken;
  let dafoCustomizer: DafoCustomizer;
  let dafoDescriptor: string;
  let weth: Weth;
  let deployer: SignerWithAddress;
  let noundersDAO: SignerWithAddress;
  let bidderA: SignerWithAddress;
  let bidderB: SignerWithAddress;
  let snapshotId: number;

  const CUSTOM_INPUT = { tokenId: 1, role: 1, palette: 0, outline: false };
  const TIME_BUFFER = 15 * 60;
  const RESERVE_PRICE = 2;
  const MIN_INCREMENT_BID_PERCENTAGE = 5;
  const DURATION = 60 * 60 * 24;

  async function deploy(descriptor: string, deployer?: SignerWithAddress) {
    const auctionHouseFactory = await ethers.getContractFactory('DafoAuctionHouse', deployer);
    return upgrades.deployProxy(auctionHouseFactory, [
      dafoToken.address,
      dafoCustomizer.address,
      descriptor,
      weth.address,
      TIME_BUFFER,
      RESERVE_PRICE,
      MIN_INCREMENT_BID_PERCENTAGE,
      DURATION,
    ]) as Promise<DafoAuctionHouse>;
  }

  before(async () => {
    [deployer, noundersDAO, bidderA, bidderB] = await ethers.getSigners();

    dafoToken = await deployDafoToken(deployer, noundersDAO.address, deployer.address);
    dafoCustomizer = await deployDafoCustomizer(deployer);
    weth = await deployWeth(deployer);

    dafoDescriptor = await dafoToken.descriptor();

    await populateDescriptor(DafoDescriptorFactory.connect(dafoDescriptor, deployer));

    dafoAuctionHouse = await deploy(dafoDescriptor, deployer);
    await dafoToken.setMinter(dafoAuctionHouse.address);
  });

  beforeEach(async () => {
    snapshotId = await ethers.provider.send('evm_snapshot', []);
  });

  afterEach(async () => {
    await ethers.provider.send('evm_revert', [snapshotId]);
  });

  it('should revert if a second initialization is attempted', async () => {
    const tx = dafoAuctionHouse.initialize(
      dafoToken.address,
      dafoCustomizer.address,
      dafoDescriptor,
      weth.address,
      TIME_BUFFER,
      RESERVE_PRICE,
      MIN_INCREMENT_BID_PERCENTAGE,
      DURATION
    );
    await expect(tx).to.be.revertedWith('Initializable: contract is already initialized');
  });

  it('should allow the dafoundersDao to unpause the contract and create the first auction', async () => {
    const tx = await dafoAuctionHouse.unpause();
    await tx.wait();

    const auction = await dafoAuctionHouse.auction();
    expect(auction.startTime.toNumber()).to.be.greaterThan(0);
  });

  it('should revert if a user creates a bid for tokenId 0', async () => {
    await (await dafoAuctionHouse.unpause()).wait();

    const { customInput } = await dafoAuctionHouse.auction();
    const tx = dafoAuctionHouse.connect(bidderA).createBid(customInput, {
      value: RESERVE_PRICE,
    });

    await expect(tx).to.be.revertedWith('Cannot create bid on token that already exists');
  });

  it('should revert if a user creates a bid for tokenId 0', async () => {
    await (await dafoAuctionHouse.unpause()).wait();

    const { customInput } = await dafoAuctionHouse.auction();
    const tx = dafoAuctionHouse.connect(bidderA).createBid(customInput, {
      value: RESERVE_PRICE,
    });

    await expect(tx).to.be.revertedWith('Cannot create bid on token that already exists');
  });

  it('should revert if role index for custom input is out of bounds', async () => {
    await (await dafoAuctionHouse.unpause()).wait();

    await dafoAuctionHouse.setAuctionCustomInput({ tokenId: 1, role: 20, palette: 0, outline: false });
    const { customInput } = await dafoAuctionHouse.auction();
    const tx = dafoAuctionHouse.connect(bidderA).createBid(customInput, {
      value: RESERVE_PRICE,
    });

    await expect(tx).to.be.revertedWith('Role index is out of bounds');
  });

  it('should revert if palette index for custom input is out of bounds', async () => {
    await (await dafoAuctionHouse.unpause()).wait();

    await dafoAuctionHouse.setAuctionCustomInput({ tokenId: 1, role: 0, palette: 20, outline: false });
    const { customInput } = await dafoAuctionHouse.auction();
    const tx = dafoAuctionHouse.connect(bidderA).createBid(customInput, {
      value: RESERVE_PRICE,
    });

    await expect(tx).to.be.revertedWith('Palette index is out of bounds');
  });

  it('should revert if a user creates a bid for an expired auction', async () => {
    await (await dafoAuctionHouse.unpause()).wait();

    await ethers.provider.send('evm_increaseTime', [60 * 60 * 25]); // Add 25 hours
    await dafoAuctionHouse.setAuctionCustomInput(CUSTOM_INPUT);
    const { customInput } = await dafoAuctionHouse.auction();

    const tx = dafoAuctionHouse.connect(bidderA).createBid(customInput, {
      value: RESERVE_PRICE,
    });

    await expect(tx).to.be.revertedWith('Auction expired');
  });

  it('should revert if a user creates a bid with an amount below the reserve price', async () => {
    await (await dafoAuctionHouse.unpause()).wait();

    await dafoAuctionHouse.setAuctionCustomInput(CUSTOM_INPUT);
    const { customInput } = await dafoAuctionHouse.auction();
    const tx = dafoAuctionHouse.connect(bidderA).createBid(customInput, {
      value: RESERVE_PRICE - 1,
    });

    await expect(tx).to.be.revertedWith('Must send at least reservePrice');
  });

  it('should revert if a user creates a bid less than the min bid increment percentage', async () => {
    await (await dafoAuctionHouse.unpause()).wait();

    await dafoAuctionHouse.setAuctionCustomInput(CUSTOM_INPUT);
    const { customInput } = await dafoAuctionHouse.auction();
    await dafoAuctionHouse.connect(bidderA).createBid(customInput, {
      value: RESERVE_PRICE * 50,
    });
    const tx = dafoAuctionHouse.connect(bidderB).createBid(customInput, {
      value: RESERVE_PRICE * 51,
    });

    await expect(tx).to.be.revertedWith('Must send more than last bid by minBidIncrementPercentage amount');
  });

  it('should refund the previous bidder when the following user creates a bid', async () => {
    await (await dafoAuctionHouse.unpause()).wait();

    await dafoAuctionHouse.setAuctionCustomInput(CUSTOM_INPUT);
    const { customInput } = await dafoAuctionHouse.auction();
    await dafoAuctionHouse.connect(bidderA).createBid(customInput, {
      value: RESERVE_PRICE,
    });

    const bidderAPostBidBalance = await bidderA.getBalance();
    await dafoAuctionHouse.connect(bidderB).createBid(customInput, {
      value: RESERVE_PRICE * 2,
    });
    const bidderAPostRefundBalance = await bidderA.getBalance();

    expect(bidderAPostRefundBalance).to.equal(bidderAPostBidBalance.add(RESERVE_PRICE));
  });

  it('should cap the maximum bid griefing cost at 30K gas + the cost to wrap and transfer WETH', async () => {
    await (await dafoAuctionHouse.unpause()).wait();

    await dafoAuctionHouse.setAuctionCustomInput(CUSTOM_INPUT);
    const { customInput } = await dafoAuctionHouse.auction();
    const maliciousBidderFactory = new MaliciousBidderFactory(bidderA);
    const maliciousBidder = await maliciousBidderFactory.deploy();

    const maliciousBid = await maliciousBidder.connect(bidderA).bid(dafoAuctionHouse.address, customInput, {
      value: RESERVE_PRICE,
    });
    await maliciousBid.wait();

    const tx = await dafoAuctionHouse.connect(bidderB).createBid(customInput, {
      value: RESERVE_PRICE * 2,
      gasLimit: 1_000_000,
    });
    const result = await tx.wait();

    expect(result.gasUsed.toNumber()).to.be.lessThan(200_000);
    expect(await weth.balanceOf(maliciousBidder.address)).to.equal(RESERVE_PRICE);
  });

  it('should emit an `AuctionBid` event on a successful bid', async () => {
    await (await dafoAuctionHouse.unpause()).wait();

    await dafoAuctionHouse.setAuctionCustomInput(CUSTOM_INPUT);
    const { customInput } = await dafoAuctionHouse.auction();
    const tx = dafoAuctionHouse.connect(bidderA).createBid(customInput, {
      value: RESERVE_PRICE,
    });

    await expect(tx)
      .to.emit(dafoAuctionHouse, 'AuctionBid')
      .withArgs(customInput.tokenId, bidderA.address, RESERVE_PRICE, false);
  });

  it('should emit an `AuctionExtended` event if the auction end time is within the time buffer', async () => {
    await (await dafoAuctionHouse.unpause()).wait();

    await dafoAuctionHouse.setAuctionCustomInput(CUSTOM_INPUT);
    const { customInput, endTime } = await dafoAuctionHouse.auction();

    await ethers.provider.send('evm_setNextBlockTimestamp', [endTime.sub(60 * 5).toNumber()]); // Subtract 5 mins from current end time

    const tx = dafoAuctionHouse.connect(bidderA).createBid(customInput, {
      value: RESERVE_PRICE,
    });

    await expect(tx)
      .to.emit(dafoAuctionHouse, 'AuctionExtended')
      .withArgs(customInput.tokenId, endTime.add(60 * 10));
  });

  it('should revert if auction settlement is attempted while the auction is still active', async () => {
    await (await dafoAuctionHouse.unpause()).wait();
    const auction = await dafoAuctionHouse.auction();

    await dafoAuctionHouse.setAuctionCustomInput(CUSTOM_INPUT);
    const { customInput } = await dafoAuctionHouse.auction();
    await dafoAuctionHouse.connect(bidderA).createBid(customInput, {
      value: RESERVE_PRICE,
    });
    const tx = dafoAuctionHouse.connect(bidderA).settleCurrentAndCreateNewAuction();

    await expect(tx).to.be.revertedWith("Auction hasn't completed");
  });

  it('should emit `AuctionSettled` and `AuctionCreated` events if all conditions are met', async () => {
    await (await dafoAuctionHouse.unpause()).wait();

    await dafoAuctionHouse.setAuctionCustomInput(CUSTOM_INPUT);
    const { customInput } = await dafoAuctionHouse.auction();

    await dafoAuctionHouse.connect(bidderA).createBid(customInput, {
      value: RESERVE_PRICE,
    });

    await ethers.provider.send('evm_increaseTime', [60 * 60 * 25]); // Add 25 hours
    const tx = await dafoAuctionHouse.connect(bidderA).settleCurrentAndCreateNewAuction();

    const receipt = await tx.wait();
    const { timestamp } = await ethers.provider.getBlock(receipt.blockHash);

    const settledEvent = receipt.events?.find((e) => e.event === 'AuctionSettled');
    const createdEvent = receipt.events?.find((e) => e.event === 'AuctionCreated');

    expect(settledEvent?.args?.tokenId).to.equal(customInput.tokenId);
    expect(settledEvent?.args?.winner).to.equal(bidderA.address);
    expect(settledEvent?.args?.amount).to.equal(RESERVE_PRICE);

    expect(createdEvent?.args?.startTime).to.equal(timestamp);
    expect(createdEvent?.args?.endTime).to.equal(timestamp + DURATION);
  });

  it('should revert if bid is created on token that already exists', async () => {
    await (await dafoAuctionHouse.unpause()).wait();

    await dafoAuctionHouse.setAuctionCustomInput(CUSTOM_INPUT);
    const { customInput } = await dafoAuctionHouse.auction();

    await dafoAuctionHouse.connect(bidderA).createBid(customInput, {
      value: RESERVE_PRICE,
    });

    await ethers.provider.send('evm_increaseTime', [60 * 60 * 25]); // Add 25 hours
    await dafoAuctionHouse.connect(bidderA).settleCurrentAndCreateNewAuction();

    await dafoAuctionHouse.setAuctionCustomInput(CUSTOM_INPUT);
    const auction = await dafoAuctionHouse.auction();

    const tx = dafoAuctionHouse.connect(bidderB).createBid(auction.customInput, {
      value: RESERVE_PRICE,
    });

    await expect(tx).to.be.revertedWith('Cannot create bid on token that already exists');
  });

  it('should not create a new auction if the auction house is paused and unpaused while an auction is ongoing', async () => {
    await (await dafoAuctionHouse.unpause()).wait();

    await (await dafoAuctionHouse.pause()).wait();

    await (await dafoAuctionHouse.unpause()).wait();

    await dafoAuctionHouse.setAuctionCustomInput(CUSTOM_INPUT);
    const { customInput } = await dafoAuctionHouse.auction();

    expect(customInput.tokenId).to.equal(1);
  });

  it('should create a new auction if the auction house is paused and unpaused after an auction is settled', async () => {
    await (await dafoAuctionHouse.unpause()).wait();

    await dafoAuctionHouse.setAuctionCustomInput(CUSTOM_INPUT);
    const { customInput } = await dafoAuctionHouse.auction();

    await dafoAuctionHouse.connect(bidderA).createBid(customInput, {
      value: RESERVE_PRICE,
    });

    await ethers.provider.send('evm_increaseTime', [60 * 60 * 25]); // Add 25 hours

    await (await dafoAuctionHouse.pause()).wait();

    const settleTx = dafoAuctionHouse.connect(bidderA).settleAuction();

    await expect(settleTx)
      .to.emit(dafoAuctionHouse, 'AuctionSettled')
      .withArgs(customInput.tokenId, bidderA.address, RESERVE_PRICE);

    const unpauseTx = await dafoAuctionHouse.unpause();
    const receipt = await unpauseTx.wait();
    const { timestamp } = await ethers.provider.getBlock(receipt.blockHash);

    const createdEvent = receipt.events?.find((e) => e.event === 'AuctionCreated');

    expect(createdEvent?.args?.startTime).to.equal(timestamp);
    expect(createdEvent?.args?.endTime).to.equal(timestamp + DURATION);
  });

  it('should settle the current auction and pause the contract if the minter is updated while the auction house is unpaused', async () => {
    await (await dafoAuctionHouse.unpause()).wait();

    await dafoAuctionHouse.setAuctionCustomInput(CUSTOM_INPUT);
    const { customInput } = await dafoAuctionHouse.auction();

    await dafoAuctionHouse.connect(bidderA).createBid(customInput, {
      value: RESERVE_PRICE,
    });

    await dafoToken.setMinter(constants.AddressZero);

    await ethers.provider.send('evm_increaseTime', [60 * 60 * 25]); // Add 25 hours

    const settleTx = dafoAuctionHouse.connect(bidderA).settleCurrentAndCreateNewAuction();

    await expect(settleTx)
      .to.emit(dafoAuctionHouse, 'AuctionSettled')
      .withArgs(customInput.tokenId, bidderA.address, RESERVE_PRICE);

    const paused = await dafoAuctionHouse.paused();

    expect(paused).to.equal(true);
  });

  it('should settle auction with default values if no bids are received', async () => {
    await (await dafoAuctionHouse.unpause()).wait();

    const { customInput } = await dafoAuctionHouse.auction();

    await ethers.provider.send('evm_increaseTime', [60 * 60 * 25]); // Add 25 hours

    const tx = dafoAuctionHouse.connect(bidderA).settleCurrentAndCreateNewAuction();

    await expect(tx)
      .to.emit(dafoAuctionHouse, 'AuctionSettled')
      .withArgs(customInput.tokenId, '0x0000000000000000000000000000000000000000', 0);
  });
});
