import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import chai from 'chai';
import { solidity } from 'ethereum-waffle';
import type { ContractTransaction } from 'ethers';
import { ethers } from 'hardhat';
import { DafoDescriptorFactory } from '../src';
import {
  DafoCustomizer,
  DafoTokenAvailability,
  DafoTokenAvailability__factory as DafoTokenAvailabilityFactory,
} from '../typechain';
import { address, deployDafoCustomizer, deployDafoDescriptor, populateDescriptor } from './utils';

chai.use(solidity);
const { expect } = chai;

describe('DafoTokenAvailability', () => {
  const maxSupply = 9;
  const firstTokenId = 1;
  const lastTokenId = maxSupply;
  const allTokenIds = [firstTokenId, 2, 3, 4, 5, 6, 7, 8, lastTokenId];

  let dafoToken: DafoTokenAvailability;
  let dafoCustomizer: DafoCustomizer;
  let deployer: SignerWithAddress;
  let dafoundersDAO: SignerWithAddress;
  let snapshotId: number;

  before(async () => {
    [deployer, dafoundersDAO] = await ethers.getSigners();

    const dafoDescriptor = await deployDafoDescriptor(deployer);
    dafoCustomizer = await deployDafoCustomizer(deployer);
    dafoToken = await new DafoTokenAvailabilityFactory(deployer).deploy(
      dafoundersDAO.address,
      deployer.address,
      deployer.address,
      dafoDescriptor.address,
      dafoCustomizer.address,
      address(0),
      maxSupply
    );

    await populateDescriptor(DafoDescriptorFactory.connect(dafoDescriptor.address, deployer));
  });

  beforeEach(async () => {
    snapshotId = await ethers.provider.send('evm_snapshot', []);
  });

  afterEach(async () => {
    await ethers.provider.send('evm_revert', [snapshotId]);
  });

  describe(`given available token ids ${allTokenIds}`, () => {
    describe('given no mint yet', () => {
      it('should have all ids available', async () => {
        const allAvailables = await fetchAllAvailables();

        expect(allAvailables).to.eql(allTokenIds);
      });
      [0, maxSupply + 1].forEach((id) => {
        it(`id ${id} should be out of bound`, async () => {
          await expect(dafoToken.findNextAvailable(id)).to.be.reverted;
        });
      });
    });

    describe(`given token ${firstTokenId} is minted`, () => {
      let dafosTokenId: number;
      let ownersTokenId: number;

      beforeEach(async () => {
        const receipt = await (await dafoToken.mint(createCustomInput(firstTokenId), deployer.address)).wait();

        const [, , , dafosDafoCreated, , , , ownersDafoCreated] = receipt.events || [];
        dafosTokenId = dafosDafoCreated?.args?.customInput.tokenId.toNumber();
        ownersTokenId = ownersDafoCreated?.args?.customInput.tokenId.toNumber();
      });

      it(`should not have token ${firstTokenId} available`, async () => {
        const allAvailables = await fetchAllAvailables();
        const [nextToDafos] = allAvailables;

        expect(nextToDafos).equals((ownersTokenId === dafosTokenId + 1 ? ownersTokenId : dafosTokenId) + 1);
        expect(allAvailables).to.eql(fromUnavailables([dafosTokenId, ownersTokenId]));
      });

      it('should not have the owners token available', async () => {
        const allAvailables = await fetchAllAvailables();
        const nextToOwners = allAvailables[ownersTokenId - 1];

        expect(nextToOwners).equals((ownersTokenId === lastTokenId ? firstTokenId : ownersTokenId) + 1);
        expect(allAvailables).to.eql(fromUnavailables([dafosTokenId, ownersTokenId]));
      });
    });

    describe(`given last token ${lastTokenId} is minted`, () => {
      let dafosTokenId: number;
      let ownersTokenId: number;

      beforeEach(async () => {
        const receipt = await (await dafoToken.mint(createCustomInput(lastTokenId), deployer.address)).wait();

        const [, , , dafosDafoCreated, , , , ownersDafoCreated] = receipt.events || [];
        dafosTokenId = dafosDafoCreated?.args?.customInput.tokenId.toNumber();
        ownersTokenId = ownersDafoCreated?.args?.customInput.tokenId.toNumber();
      });

      it('should loop to first available token', async () => {
        const allAvailables = await fetchAllAvailables();
        const firstAvailable = await dafoToken.findNextAvailable(lastTokenId);

        expect(firstAvailable).equals(ownersTokenId === firstTokenId ? firstTokenId + 1 : firstTokenId);
        expect(allAvailables).to.eql(fromUnavailables([dafosTokenId, ownersTokenId]));
      });
    });

    describe('given simulating all dafos mint', () => {
      let mintedIds: number[] = [];
      let trackedAvailability: number[][] = [];
      let expectedAvailability: number[][] = [];

      beforeEach(async () => {
        mintedIds = [];
        trackedAvailability = [];
        expectedAvailability = [];

        do {
          trackedAvailability.push(await fetchAllAvailables());
          expectedAvailability.push(fromUnavailables(mintedIds));

          const idChoices = allTokenIds.filter((id) => !mintedIds.includes(id));
          const nextId = idChoices[Math.floor(Math.random() * idChoices.length)];
          const events = await extractDafoCreatedEvents(dafoToken.mint(createCustomInput(nextId), deployer.address));

          events.forEach((e) => mintedIds.push(e?.args?.customInput.tokenId.toNumber()));
        } while (mintedIds.length < allTokenIds.length);
      });

      it('should have minted all tokens', async () => {
        expect(mintedIds.sort()).to.eql(allTokenIds);
      });

      it('should have no tokens available', async () => {
        await expect(dafoToken.findNextAvailable(firstTokenId)).to.be.revertedWith('no tokens left');
      });

      Array.from(Array(10)).forEach((_, i, { length }) => {
        it(`run ${i + 1} of ${length} - should keep track of token availability`, async () => {
          expect(expectedAvailability).to.eql(trackedAvailability);
        });
      });
    });
  });

  function createCustomInput(tokenId: number) {
    return { tokenId, role: 0, palette: 0, outline: false } as const;
  }

  function fetchAllAvailables() {
    return Promise.all(allTokenIds.map((id) => dafoToken.findNextAvailable(id)));
  }

  function fromUnavailables(mintedIds: number[]) {
    return mintedIds.reduce((availables, _) => {
      return availables.map((id) => (mintedIds.includes(id) ? (id % maxSupply) + 1 : id));
    }, allTokenIds);
  }

  async function extractDafoCreatedEvents(tx: Promise<ContractTransaction>) {
    return (await (await tx).wait()).events?.flatMap((e, i) => ((i + 1) % 4 === 0 ? [e] : [])) || [];
  }
});
