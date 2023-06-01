// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.6;

import { IDafoAuctionHouse } from '../interfaces/IDafoAuctionHouse.sol';
import { IDafoCustomizer } from '../interfaces/IDafoCustomizer.sol';

contract MaliciousBidder {
    function bid(IDafoAuctionHouse auctionHouse, IDafoCustomizer.CustomInput calldata customInput) public payable {
        auctionHouse.createBid{ value: msg.value }(customInput);
    }

    receive() external payable {
        assembly {
            invalid()
        }
    }
}
