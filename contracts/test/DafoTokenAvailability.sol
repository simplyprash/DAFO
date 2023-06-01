// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.6;

import '../DafoToken.sol';

contract DafoTokenAvailability is DafoToken {
    constructor(
        address _dafoundersDAO,
        address _minter,
        address _earlyAccessMinter,
        IDafoDescriptor _descriptor,
        IDafoCustomizer _customizer,
        IProxyRegistry _proxyRegistry,
        uint16 _maxSupply
    ) DafoToken(_dafoundersDAO, _minter, _earlyAccessMinter, _descriptor, _customizer, _proxyRegistry) {
        maxSupply = _maxSupply;
    }
}
