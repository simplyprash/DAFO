// SPDX-License-Identifier: GPL-3.0

/// @title The DafoToken customizer

// LICENSE
// DafoCustomizer.sol is a modified version of Nouns's NounsSeeder.sol:
// https://github.com/nounsDAO/nouns-monorepo/blob/1f1899c1602f04c7fca96458061a8baf3a6cc9ec/packages/nouns-contracts/contracts/NounsSeeder.sol
//
// NounsSeeder.sol source code Copyright Nouns licensed under the GPL-3.0 license.
// With modifications by Dafounders DAO.

pragma solidity ^0.8.6;

import {IDafoCustomizer} from './interfaces/IDafoCustomizer.sol';
import {IDafoDescriptor} from './interfaces/IDafoDescriptor.sol';

contract DafoCustomizer is IDafoCustomizer {
    /**
     * @notice Generate a pseudo-random Input using the previous blockhash and a taken ID.
     */
    // prettier-ignore
    function generateInput(uint256 unavailableId, uint256 tokenMaxSupply, IDafoDescriptor descriptor) external view override returns (CustomInput memory) {
        uint256 pseudorandomness = uint256(
            keccak256(abi.encodePacked(blockhash(block.number - 1), unavailableId))
        );

        return CustomInput({
            tokenId: uint48(pseudorandomness) % tokenMaxSupply + 1, // 0 < tokenId <= tokenMaxSupply
            role: uint8(
                uint48(pseudorandomness >> 48) % descriptor.roleCount()
            ),
            palette: uint8(
                uint48(pseudorandomness >> 96) % descriptor.paletteCount()
            ),
            outline: uint48(pseudorandomness >> 144) % 2 == 1
        });
    }

    // prettier-ignore
    function create(uint256 tokenId, uint8 role, uint8 palette, bool outline) external pure override returns (CustomInput memory) {

        return CustomInput({
            tokenId: tokenId,
            role: role,
            palette: palette,
            outline: outline
        });
    }

    function isInBounds(IDafoDescriptor descriptor, IDafoCustomizer.CustomInput calldata _customInput)
        external
        view
        override
    {
        require(descriptor.roleCount() > _customInput.role, 'Role index is out of bounds');
        require(descriptor.paletteCount() > _customInput.palette, 'Palette index is out of bounds');
    }
}
