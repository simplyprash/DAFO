import chai from 'chai';
import { solidity } from 'ethereum-waffle';
import { ethers } from 'hardhat';
import ImageData from '../files/dafo-image-data.json';
import { DafoDescriptor } from '../typechain';
import { deployDafoDescriptor, populateDescriptor } from './utils';

chai.use(solidity);
const { expect } = chai;

describe('DafoDescriptor', () => {
  let dafoDescriptor: DafoDescriptor;
  let snapshotId: number;

  before(async () => {
    dafoDescriptor = await deployDafoDescriptor();

    await populateDescriptor(dafoDescriptor);
  });

  beforeEach(async () => {
    snapshotId = await ethers.provider.send('evm_snapshot', []);
  });

  afterEach(async () => {
    await ethers.provider.send('evm_revert', [snapshotId]);
  });

  it('should generate valid token uri metadata when data uris are disabled', async () => {
    const BASE_URI = 'https://api.nouns.wtf/metadata/';

    await dafoDescriptor.setBaseURI(BASE_URI);
    await dafoDescriptor.toggleDataURIEnabled();

    const tokenUri = await dafoDescriptor.tokenURI({
      tokenId: 0,
      role: 0,
      palette: 0,
      outline: false,
    });
    expect(tokenUri).to.equal(`${BASE_URI}0`);
  });

  it('should generate valid token uri metadata when data uris are enabled', async () => {
    const tokenUri = await dafoDescriptor.tokenURI({
      tokenId: 100,
      role: 0,
      palette: 2,
      outline: false,
    });
    const { name, description, image } = JSON.parse(
      Buffer.from(tokenUri.replace('data:application/json;base64,', ''), 'base64').toString('ascii')
    );

    expect(name).to.equal('DAFO0100');
    expect(description).to.equal('Dafounder 0100 is a member of the DAFO DAO');
    expect(image).to.not.be.undefined;
  });

  describe('given many parts added', () => {
    const { digits, roles, palettes } = ImageData;

    it('should keep track of each part count', async () => {
      const digitCount = (await dafoDescriptor.digitCount()).toNumber();
      const roleCount = (await dafoDescriptor.roleCount()).toNumber();
      const paletteCount = (await dafoDescriptor.paletteCount()).toNumber();

      expect([digitCount, roleCount, paletteCount]).to.eql([digits.length, roles.length, palettes.length]);
    });

    describe('given single part added', () => {
      beforeEach(async () => {
        await dafoDescriptor.addDigit(digits.length, digits[0]);
        await dafoDescriptor.addRole(roles.length, roles[0]);
        await dafoDescriptor.addPalette(palettes.length, palettes[0]);
      });

      it('should keep track of each part count', async () => {
        const digitCount = (await dafoDescriptor.digitCount()).toNumber();
        const roleCount = (await dafoDescriptor.roleCount()).toNumber();
        const paletteCount = (await dafoDescriptor.paletteCount()).toNumber();

        expect([digitCount, roleCount, paletteCount]).to.eql([
          digits.length + 1,
          roles.length + 1,
          palettes.length + 1,
        ]);
      });
    });

    describe('given single part replaced', () => {
      beforeEach(async () => {
        await dafoDescriptor.addDigit(digits.length - 1, digits[0]);
        await dafoDescriptor.addRole(roles.length - 1, roles[0]);
        await dafoDescriptor.addPalette(palettes.length - 1, palettes[0]);
      });

      it('should keep the same count for each part', async () => {
        const digitCount = (await dafoDescriptor.digitCount()).toNumber();
        const roleCount = (await dafoDescriptor.roleCount()).toNumber();
        const paletteCount = (await dafoDescriptor.paletteCount()).toNumber();

        expect([digitCount, roleCount, paletteCount]).to.eql([digits.length, roles.length, palettes.length]);
      });
    });

    describe('given single part added out of bound', () => {
      it('should revert', async () => {
        expect(dafoDescriptor.addDigit(digits.length + 1, digits[0])).to.be.revertedWith('index is out of bound');
        expect(dafoDescriptor.addRole(roles.length + 1, roles[0])).to.be.revertedWith('index is out of bound');
        expect(dafoDescriptor.addPalette(palettes.length + 1, palettes[0])).to.be.revertedWith('index is out of bound');
      });
    });
  });
});
