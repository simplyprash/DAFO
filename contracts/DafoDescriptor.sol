// SPDX-License-Identifier: GPL-3.0

/// @title The Dafo NFT descriptor

// LICENSE
// DafoDescriptor.sol is a modified version of Nouns's NounDescriptor.sol:
// https://github.com/nounsDAO/nouns-monorepo/blob/1f1899c1602f04c7fca96458061a8baf3a6cc9ec/packages/nouns-contracts/contracts/NounsDescriptor.sol
//
// NounDescriptor.sol source code Copyright Nouns licensed under the GPL-3.0 license.
// With modifications by Dafounders DAO.

pragma solidity ^0.8.6;

import {Ownable} from '@openzeppelin/contracts/access/Ownable.sol';
import {Strings} from '@openzeppelin/contracts/utils/Strings.sol';
import {IDafoDescriptor} from './interfaces/IDafoDescriptor.sol';
import {IDafoCustomizer} from './interfaces/IDafoCustomizer.sol';
import {NFTDescriptor} from './libs/NFTDescriptor.sol';
import {MultiPartSVGsToSVG} from './libs/MultiPartSVGsToSVG.sol';

contract DafoDescriptor is IDafoDescriptor, Ownable {
    using Strings for uint256;

    // prettier-ignore
    // https://creativecommons.org/publicdomain/zero/1.0/legalcode.txt
    bytes32 constant COPYRIGHT_CC0_1_0_UNIVERSAL_LICENSE = 0xa2010f343487d3f7618affe54f789f5487602331c0a8d03f49e9a7c547cf0499;

    // Whether or not new Dafo parts can be added
    bool public override arePartsLocked;

    // Whether or not `tokenURI` should be returned as a data URI (Default: true)
    bool public override isDataURIEnabled = true;

    // Base URI
    string public override baseURI;

    // Dafo Numbers (Custom SVG)
    mapping(uint8 => string) public digits;
    uint256 public override digitCount;

    // Dafo Roles (Custom SVG)
    mapping(uint8 => string) public roles;
    uint256 public override roleCount;

    // Dafo Backgrounds (Hex Colors)
    mapping(uint8 => Palette) public palettes;
    uint256 public override paletteCount;

    /**
     * @notice Require that the parts have not been locked.
     */
    modifier whenPartsNotLocked() {
        require(!arePartsLocked, 'Parts are locked');
        _;
    }

    /**
     * @notice Require that added part index is in bound.
     */
    modifier whenPartIndexIsInBound(uint256 index, uint256 count) {
        require(index <= count, 'index is out of bound');
        _;
    }

    /**
     * @notice Batch add Dafo digits.
     * @dev This function can only be called by the owner when not locked.
     */
    function addManyDigits(string[] calldata _digits) external override onlyOwner whenPartsNotLocked {
        for (uint8 i = 0; i < _digits.length; i++) {
            _addDigit(i, _digits[i]);
        }
        digitCount = _digits.length;
    }

    /**
     * @notice Batch add Dafo roles.
     * @dev This function can only be called by the owner when not locked.
     */
    function addManyRoles(string[] calldata _roles) external override onlyOwner whenPartsNotLocked {
        for (uint8 i = 0; i < _roles.length; i++) {
            _addRole(i, _roles[i]);
        }
        roleCount = _roles.length;
    }

    /**
     * @notice Batch add Dafo palettes.
     * @dev This function can only be called by the owner when not locked.
     */
    function addManyPalettes(Palette[] calldata _palettes) external override onlyOwner whenPartsNotLocked {
        for (uint8 i = 0; i < _palettes.length; i++) {
            _addPalette(i, _palettes[i]);
        }
        paletteCount = _palettes.length;
    }

    /**
     * @notice Add a Dafo digit.
     * @dev This function can only be called by the owner when not locked.
     */
    function addDigit(uint8 index, string calldata _digit)
        external
        override
        onlyOwner
        whenPartsNotLocked
        whenPartIndexIsInBound(index, digitCount)
    {
        _addDigit(index, _digit);
        if (index == digitCount) {
            ++digitCount;
        }
    }

    /**
     * @notice Add a Dafo role.
     * @dev This function can only be called by the owner when not locked.
     */
    function addRole(uint8 index, string calldata _roles)
        external
        override
        onlyOwner
        whenPartsNotLocked
        whenPartIndexIsInBound(index, roleCount)
    {
        _addRole(index, _roles);
        if (index == roleCount) {
            ++roleCount;
        }
    }

    /**
     * @notice Add a Dafo palette.
     * @dev This function can only be called by the owner when not locked.
     */
    function addPalette(uint8 index, Palette calldata _palette)
        external
        override
        onlyOwner
        whenPartsNotLocked
        whenPartIndexIsInBound(index, paletteCount)
    {
        _addPalette(index, _palette);
        if (index == paletteCount) {
            ++paletteCount;
        }
    }

    /**
     * @notice Lock all Dafo parts.
     * @dev This cannot be reversed and can only be called by the owner when not locked.
     */
    function lockParts() external override onlyOwner whenPartsNotLocked {
        arePartsLocked = true;

        emit PartsLocked();
    }

    /**
     * @notice Toggle a boolean value which determines if `tokenURI` returns a data URI
     * or an HTTP URL.
     * @dev This can only be called by the owner.
     */
    function toggleDataURIEnabled() external override onlyOwner {
        bool enabled = !isDataURIEnabled;

        isDataURIEnabled = enabled;
        emit DataURIToggled(enabled);
    }

    /**
     * @notice Set the base URI for all token IDs. It is automatically
     * added as a prefix to the value returned in {tokenURI}, or to the
     * token ID if {tokenURI} is empty.
     * @dev This can only be called by the owner.
     */
    function setBaseURI(string calldata _baseURI) external override onlyOwner {
        baseURI = _baseURI;

        emit BaseURIUpdated(_baseURI);
    }

    /**
     * @notice Given a token ID and customizerInfo, construct a token URI for an official Dafo DAO clubId.
     * @dev The returned value may be a base64 encoded data URI or an API URL.
     */
    function tokenURI(IDafoCustomizer.CustomInput memory customInput) external view override returns (string memory) {
        if (isDataURIEnabled) {
            return dataURI(customInput);
        }
        return string(abi.encodePacked(baseURI, customInput.tokenId.toString()));
    }

    /**
     * @notice Given a token ID and CustomInput, construct a base64 encoded data URI for an official Dafo DAO clubId.
     */
    function dataURI(IDafoCustomizer.CustomInput memory customInput) public view override returns (string memory) {
        string memory clubId = _getClubIdFromTokenId(customInput.tokenId);
        string memory name = string(abi.encodePacked('DAFO', clubId));
        string memory description = string(abi.encodePacked('Dafounder ', clubId, ' is a member of the DAFO DAO'));

        return genericDataURI(name, description, customInput);
    }

    /**
     * @notice Given a name, description, and customInput, construct a base64 encoded data URI.
     */
    function genericDataURI(
        string memory name,
        string memory description,
        IDafoCustomizer.CustomInput memory customInput
    ) public view override returns (string memory) {
        NFTDescriptor.TokenURIParams memory params = NFTDescriptor.TokenURIParams({
            name: name,
            description: description,
            parts: _getPartsForTokenId(customInput),
            role: roles[customInput.role],
            background: palettes[customInput.palette].background,
            fill: palettes[customInput.palette].fill,
            outline: customInput.outline
        });
        return NFTDescriptor.constructTokenURI(params);
    }

    /**
     * @notice Given a customInput, construct a base64 encoded SVG image.
     */
    function generateSVGImage(IDafoCustomizer.CustomInput memory customInput)
        external
        view
        override
        returns (string memory)
    {
        MultiPartSVGsToSVG.SVGParams memory params = MultiPartSVGsToSVG.SVGParams({
            parts: _getPartsForTokenId(customInput),
            role: roles[customInput.role],
            background: palettes[customInput.palette].background,
            fill: palettes[customInput.palette].fill,
            outline: customInput.outline
        });
        return NFTDescriptor.generateSVGImage(params);
    }

    /**
     * @notice Add a Dafo number.
     */
    function _addDigit(uint8 index, string calldata _digit) internal {
        digits[index] = _digit;
    }

    /**
     * @notice Add a Dafo role.
     */
    function _addRole(uint8 index, string calldata _role) internal {
        roles[index] = _role;
    }

    /**
     * @notice Add a Dafo palette.
     */
    function _addPalette(uint8 index, Palette calldata _palette) internal {
        palettes[index] = _palette;
    }

    /**
     * @notice Get all Dafo parts for the passed `customInput`.
     */
    function _getPartsForTokenId(IDafoCustomizer.CustomInput memory customInput)
        internal
        view
        returns (string[] memory)
    {
        uint8 numDigits = 4;

        if (customInput.tokenId == 10000) {
            numDigits = 5;
        }

        string[] memory _parts = new string[](numDigits);
        uint8 j = 0;

        for (uint8 i = numDigits; i > 0; i--) {
            uint8 digitIndex = uint8((customInput.tokenId / (10**j)) % 10);
            _parts[i - 1] = digits[digitIndex];
            j++;
        }

        return _parts;
    }

    /**
     * @notice Generate DAFO name.
     */
    function _getClubIdFromTokenId(uint256 tokenId) internal pure returns (string memory) {
        if (tokenId < 10) {
            return string(abi.encodePacked('000', tokenId.toString()));
        } else if (tokenId < 100) {
            return string(abi.encodePacked('00', tokenId.toString()));
        } else if (tokenId < 1000) {
            return string(abi.encodePacked('0', tokenId.toString()));
        } else {
            return string(abi.encodePacked(tokenId.toString()));
        }
    }
}
