// SPDX-License-Identifier: GPL-3.0

/// @title The Dafo ERC-721 token

// LICENSE
// DafoToken.sol is a modified version of Nouns's NounsToken.sol:
// https://github.com/nounsDAO/nouns-monorepo/blob/1f1899c1602f04c7fca96458061a8baf3a6cc9ec/packages/nouns-contracts/contracts/NounsToken.sol
//
// NounsToken.sol source code Copyright Nouns licensed under the GPL-3.0 license.
// With modifications by Dafounders DAO.

pragma solidity ^0.8.6;

import {Ownable} from '@openzeppelin/contracts/access/Ownable.sol';
import {ERC721Checkpointable} from './base/ERC721Checkpointable.sol';
import {IDafoDescriptor} from './interfaces/IDafoDescriptor.sol';
import {IDafoCustomizer} from './interfaces/IDafoCustomizer.sol';
import {IDafoToken} from './interfaces/IDafoToken.sol';
import {ERC721} from './base/ERC721.sol';
import {IERC721} from '@openzeppelin/contracts/token/ERC721/IERC721.sol';
import {IProxyRegistry} from './external/opensea/IProxyRegistry.sol';

contract DafoToken is IDafoToken, Ownable, ERC721Checkpointable {
    // The dafounders DAO address (creators org)
    address public dafoundersDAO;

    // The earlyAccessMinter wallet
    address public earlyAccessMinter;

    // An address who has permissions to mint Dafos
    address public minter;

    // The Dafo token URI descriptor
    IDafoDescriptor public descriptor;

    // The Dafo token customizer
    IDafoCustomizer public customizer;

    // Whether the minter can be updated
    bool public isMinterLocked;

    // Whether the minter can be updated
    bool public isEarlyAccessMinterLocked;

    // Whether the descriptor can be updated
    bool public isDescriptorLocked;

    // Whether the customizer can be updated
    bool public isCustomizerLocked;

    // The dafo customInputs
    mapping(uint256 => IDafoCustomizer.CustomInput) public customInputs;

    // The dafo max supply
    uint16 internal maxSupply = 10000;

    // IPFS content hash of contract-level metadata
    string private _contractURIHash = 'bafybeicicxtkwszk2gsuyawuecf2quhaokqut6steoiquv5j63wc2wsxm4/contract-uri.json';

    // OpenSea's Proxy Registry
    IProxyRegistry public immutable proxyRegistry;

    /**
     * @notice Node of a disjoint-set data structure.
     * @dev If availableRank <= 0, then tokenId is available (node is a representative), else points to the next hypothetically representative.
     * See https://en.wikipedia.org/wiki/Disjoint-set_data_structure.
     */
    struct AvailableIdNode {
        int16 availableRank; //
        uint16 tokenId;
    }

    mapping(uint16 => AvailableIdNode) private availableIdForest;

    /**
     * @notice Require that the minter has not been locked.
     */
    modifier whenMinterNotLocked() {
        require(!isMinterLocked, 'Minter is locked');
        _;
    }

    /**
     * @notice Require that the minter has not been locked.
     */
    modifier whenEarlyAccessMinterNotLocked() {
        require(!isEarlyAccessMinterLocked, 'Early access minter is locked');
        _;
    }

    /**
     * @notice Require that the descriptor has not been locked.
     */
    modifier whenDescriptorNotLocked() {
        require(!isDescriptorLocked, 'Descriptor is locked');
        _;
    }

    /**
     * @notice Require that the customizer has not been locked.
     */
    modifier whenCustomizerNotLocked() {
        require(!isCustomizerLocked, 'Customizer is locked');
        _;
    }

    /**
     * @notice Require that the sender is the dafounders DAO.
     */
    modifier onlyDafoundersDAO() {
        require(msg.sender == dafoundersDAO, 'Sender is not the dafounders DAO');
        _;
    }

    /**
     * @notice Require that the sender is the minter.
     */
    modifier onlyMinter() {
        require(
            msg.sender == minter || (!isEarlyAccessMinterLocked && (msg.sender == earlyAccessMinter)),
            'Sender is not the minter'
        );
        _;
    }

    constructor(
        address _dafoundersDAO,
        address _minter,
        address _earlyAccessMinter,
        IDafoDescriptor _descriptor,
        IDafoCustomizer _customizer,
        IProxyRegistry _proxyRegistry
    ) ERC721('Dafo', 'DAFO', _dafoundersDAO, 500) {
        dafoundersDAO = _dafoundersDAO;
        minter = _minter;
        earlyAccessMinter = _earlyAccessMinter;
        descriptor = _descriptor;
        customizer = _customizer;
        proxyRegistry = _proxyRegistry;
    }

    /**
     * @notice The IPFS URI of contract-level metadata.
     */
    function contractURI() public view returns (string memory) {
        return string(abi.encodePacked('ipfs://', _contractURIHash));
    }

    /**
     * @notice Set the _contractURIHash.
     * @dev Only callable by the owner.
     */
    function setContractURIHash(string memory newContractURIHash) external onlyOwner {
        _contractURIHash = newContractURIHash;
    }

    /**
     * @notice Override isApprovedForAll to whitelist user's OpenSea proxy accounts to enable gas-less listings.
     */
    function isApprovedForAll(address owner, address operator) public view override(IERC721, ERC721) returns (bool) {
        // Whitelist OpenSea proxy contract for easy trading.
        if (proxyRegistry.proxies(owner) == operator) {
            return true;
        }
        return super.isApprovedForAll(owner, operator);
    }

    /**
     * @notice Mint a Dafo to the minter, along with a possible founders reward
     * Dafo. Founders reward Dafo are minted every 10 Token ids, starting at 0,
     * until 183 Token ids have been minted (5 years w/ 24 hour auctions).
     * @dev Call _mintTo with the to address(es).
     */
    function mint(IDafoCustomizer.CustomInput calldata customInput, address to)
        public
        override
        onlyMinter
        returns (uint256)
    {
        require(
            customInput.tokenId > 0 && customInput.tokenId <= maxSupply,
            'DafoToken: Token cannot be lower than 1 or greater than 10 000'
        );
        require(!_exists(customInput.tokenId), 'DafoToken: Token exists already');

        uint256 totalSupply = totalSupply();
        _mintTo(to, customInput);

        if (totalSupply <= 1820 && totalSupply % 10 == 0) {
            IDafoCustomizer.CustomInput memory randomInput = customizer.generateInput(
                customInput.tokenId,
                maxSupply,
                descriptor
            );
            randomInput.tokenId = availableIdForest[_findNextAvailable(uint16(randomInput.tokenId))].tokenId;
            _mintTo(dafoundersDAO, randomInput);
        }

        return customInput.tokenId;
    }

    /**
     * @notice Burn a dafo.
     */
    function burn(uint256 tokenId) public override onlyMinter {
        _burn(tokenId);
        emit DafoBurned(tokenId);
    }

    /**
     * @notice A distinct Uniform Resource Identifier (URI) for a given asset.
     * @dev See {IERC721Metadata-tokenURI}.
     */
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_exists(tokenId), 'DafoToken: URI query for nonexistent token');
        return descriptor.tokenURI(customInputs[tokenId]);
    }

    /**
     * @notice Similar to `tokenURI`, but always serves a base64 encoded data URI
     * with the JSON contents directly inlined.
     */
    function dataURI(uint256 tokenId) public view override returns (string memory) {
        require(_exists(tokenId), 'DafoToken: URI query for nonexistent token');
        return descriptor.dataURI(customInputs[tokenId]);
    }

    /**
     * @notice exists in order to verify if the minter will be able to mint
     * the token. Debug function ?
     */
    function exists(uint256 tokenId) public view override returns (bool) {
        if (tokenId < 1 || tokenId > maxSupply) {
            return true;
        }

        return _exists(tokenId);
    }

    /**
     * @notice Set the dafounders DAO.
     * @dev Only callable by the dafounders DAO when not locked.
     */
    function setDafoundersDAO(address _dafoundersDAO) external override onlyDafoundersDAO {
        dafoundersDAO = _dafoundersDAO;

        emit DafoundersDAOUpdated(_dafoundersDAO);
    }

    /**
     * @notice Set the token minter.
     * @dev Only callable by the owner when not locked.
     */
    function setMinter(address _minter) external override onlyOwner whenMinterNotLocked {
        minter = _minter;

        emit MinterUpdated(_minter);
    }

    /**
     * @notice Lock the minter.
     * @dev This cannot be reversed and is only callable by the owner when not locked.
     */
    function lockMinter() external override onlyOwner whenMinterNotLocked {
        isMinterLocked = true;

        emit MinterLocked();
    }

    /**
     * @notice Lock early access minter.
     * @dev This cannot be reversed and is only callable by the owner when not locked.
     */
    function lockEarlyAccessMinter() external override onlyOwner whenEarlyAccessMinterNotLocked {
        isEarlyAccessMinterLocked = true;

        emit EarlyAccessMinterLocked();
    }

    /**
     * @notice Set the token URI descriptor.
     * @dev Only callable by the owner when not locked.
     */
    function setDescriptor(IDafoDescriptor _descriptor) external override onlyOwner whenDescriptorNotLocked {
        descriptor = _descriptor;

        emit DescriptorUpdated(_descriptor);
    }

    /**
     * @notice Lock the descriptor.
     * @dev This cannot be reversed and is only callable by the owner when not locked.
     */
    function lockDescriptor() external override onlyOwner whenDescriptorNotLocked {
        isDescriptorLocked = true;

        emit DescriptorLocked();
    }

    /**
     * @notice Set the token customizer.
     * @dev Only callable by the owner when not locked.
     */
    function setCustomizer(IDafoCustomizer _customizer) external override onlyOwner whenCustomizerNotLocked {
        customizer = _customizer;

        emit CustomizerUpdated(_customizer);
    }

    /**
     * @notice Lock the customizer.
     * @dev This cannot be reversed and is only callable by the owner when not locked.
     */
    function lockCustomizer() external override onlyOwner whenCustomizerNotLocked {
        isCustomizerLocked = true;

        emit CustomizerLocked();
    }

    /**
     * @notice Find the first available token, starting from hypothetical `representative`.
     * @dev Use _findNextAvailable to apply path compression whenever possible.
     */
    function findNextAvailable(uint16 representative) external view override returns (uint16) {
        require(0 < representative && representative <= maxSupply, 'id is out of bound: 0 < id <= 10000');
        require(totalSupply() < maxSupply, 'no tokens left');

        AvailableIdNode storage node = availableIdForest[representative];

        if (node.availableRank == 0) {
            return representative;
        }
        while (node.availableRank > 0) {
            representative = uint16(node.availableRank);
            node = availableIdForest[representative];
        }

        return node.tokenId;
    }

    /**
     * @notice Mint a dafo with `tokenId` to the provided `to` address.
     */
    function _mintTo(address to, IDafoCustomizer.CustomInput memory customInput) internal returns (uint256) {
        customInputs[customInput.tokenId] = customInput;

        _mint(owner(), to, customInput.tokenId);
        _mergeAvailableId(uint16(customInput.tokenId));
        emit DafoCreated(customInput.tokenId, customInput);

        return customInput.tokenId;
    }

    // /**
    //  * @notice Merge the representive of `tokenId` with the next one, effectively marking `tokenId` as unavailable.
    //  */
    function _mergeAvailableId(uint16 tokenId) internal {
        uint16 rep = _findNextAvailable(tokenId);
        uint16 nextRep = _findNextAvailable((tokenId % maxSupply) + 1);

        if (rep == nextRep) {
            return;
        }

        AvailableIdNode storage repNode = availableIdForest[rep];
        AvailableIdNode storage nextRepNode = availableIdForest[nextRep];

        if (repNode.availableRank <= nextRepNode.availableRank) {
            if (repNode.availableRank == nextRepNode.availableRank) {
                --nextRepNode.availableRank;
            }
            repNode.availableRank = int16(nextRep);
        } else {
            nextRepNode.availableRank = int16(rep);
            repNode.tokenId = nextRepNode.tokenId;
        }
    }

    /**
     * @notice Find the representative of the first available token, at or next to `tokenId`.
     */
    function _findNextAvailable(uint16 tokenId) internal returns (uint16) {
        AvailableIdNode storage node = availableIdForest[tokenId];

        if (node.availableRank == 0) {
            node.availableRank = -1;
            node.tokenId = tokenId;
        } else if (node.availableRank > 0) {
            int16 representative;
            do {
                representative = node.availableRank;
                node = availableIdForest[uint16(representative)];
            } while (node.availableRank > 0);

            node = availableIdForest[tokenId];
            do {
                tokenId = uint16(node.availableRank);
                node.availableRank = representative;
                node = availableIdForest[tokenId];
            } while (node.availableRank > 0);
        }

        return tokenId;
    }
}
