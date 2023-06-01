// SPDX-License-Identifier: GPL-3.0

/// @title A library used to convert multi-part RLE compressed images to SVG

pragma solidity ^0.8.6;

import '@openzeppelin/contracts/utils/Strings.sol';

library MultiPartSVGsToSVG {
    struct SVGParams {
        string[] parts;
        string role;
        string background;
        string fill;
        bool outline;
    }

    /**
     * @notice Given SVGs image parts and color palettes, merge to generate a single SVG image.
     */
    function generateSVG(SVGParams memory params) internal pure returns (string memory svg) {
        // prettier-ignore
        return
            string(
                abi.encodePacked(
                    '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">',
                    _generateOutline(params),
                    '<rect width="100%" height="100%" fill="#',
                    params.background,
                    '" />',
                    '<g fill="#',
                    params.fill,
                    '">',
                    params.role,
                    '</g>',
                    _generateSVGDigits(params),
                    '</svg>'
                )
            );
    }

    /**
     * @notice Given SVG of each digit, generate svg group of digits
     */
    // prettier-ignore
    function _generateSVGDigits(SVGParams memory params)
        private
        pure
        returns (string memory svg)
    {
        string memory digits;
        uint16 translateX = 1700;
        for (uint8 p = 0; p < params.parts.length; p++) {
            digits = string(abi.encodePacked(digits, '<g transform="scale(0.01) translate(', Strings.toString(translateX), ',2800)">', params.parts[p], ' fill="#', params.fill, '" /></g>'));
            translateX += 300;
        }
        return digits;
    }

    /**
     * @notice Given SVG of each digit, generate svg group of digits
     */
    // prettier-ignore
    function _generateOutline(SVGParams memory params)
        private
        pure
        returns (string memory svg)
    {
        if (params.outline) {
            return string(abi.encodePacked('<style>.outline{fill:none;stroke:#', params.fill, ';stroke-miterlimit:10;stroke-width:0.1px;}</style>'));
        }
    }
}
