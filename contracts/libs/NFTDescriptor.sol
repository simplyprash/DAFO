// SPDX-License-Identifier: GPL-3.0

/// @title A library used to construct ERC721 token URIs and SVG images

pragma solidity ^0.8.6;

import {Base64} from 'base64-sol/base64.sol';
import {MultiPartSVGsToSVG} from './MultiPartSVGsToSVG.sol';

library NFTDescriptor {
    struct TokenURIParams {
        string name;
        string description;
        string[] parts;
        string role;
        string background;
        string fill;
        bool outline;
    }

    /**
     * @notice Construct an ERC721 token URI.
     */
    function constructTokenURI(TokenURIParams memory params) public pure returns (string memory) {
        string memory image = generateSVGImage(
            MultiPartSVGsToSVG.SVGParams({
                parts: params.parts,
                background: params.background,
                role: params.role,
                fill: params.fill,
                outline: params.outline
            })
        );

        // prettier-ignore
        return string(
            abi.encodePacked(
                'data:application/json;base64,',
                Base64.encode(
                    bytes(
                        abi.encodePacked('{"name":"', params.name, '", "description":"', params.description, '", "image": "', 'data:image/svg+xml;base64,', image, '"}')
                    )
                )
            )
        );
    }

    /**
     * @notice Generate an SVG image for use in the ERC721 token URI.
     */
    function generateSVGImage(MultiPartSVGsToSVG.SVGParams memory params) public pure returns (string memory svg) {
        return Base64.encode(bytes(MultiPartSVGsToSVG.generateSVG(params)));
    }
}
