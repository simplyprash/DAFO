// SPDX-License-Identifier: GPL-3.0

/// @title The Dafounders DAO auction house

// LICENSE
// DafoAuctionHouse.sol is a modified version of Nouns's NounsAuctionHouse.sol:
// https://github.com/nounsDAO/nouns-monorepo/blob/1f1899c1602f04c7fca96458061a8baf3a6cc9ec/packages/nouns-contracts/contracts/NounsAuctionHouse.sol
//
// NounsAuctionHouse.sol source code Copyright Nouns licensed under the GPL-3.0 license.
// With modifications by Dafounders DAO.
//
// NounsAuctionHouse.sol is a modified version of Zora's AuctionHouse.sol:
// https://github.com/ourzora/auction-house/blob/54a12ec1a6cf562e49f0a4917990474b11350a2d/contracts/AuctionHouse.sol
//
// AuctionHouse.sol source code Copyright Zora licensed under the GPL-3.0 license.
// With modifications by Nounders DAO.

pragma solidity ^0.8.6;

import {PausableUpgradeable} from '@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol';
import {ReentrancyGuardUpgradeable} from '@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol';
import {OwnableUpgradeable} from '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import {IDafoAuctionHouse} from './interfaces/IDafoAuctionHouse.sol';
import {IDafoCustomizer} from './interfaces/IDafoCustomizer.sol';
import {IDafoDescriptor} from './interfaces/IDafoDescriptor.sol';
import {IDafoToken} from './interfaces/IDafoToken.sol';
import {IWETH} from './interfaces/IWETH.sol';

contract DafoAuctionHouse is IDafoAuctionHouse, PausableUpgradeable, ReentrancyGuardUpgradeable, OwnableUpgradeable {
    // The DafoToken ERC721 token contract
    IDafoToken public dafoToken;

    // The DafoCustomizer contract
    IDafoCustomizer public dafoCustomizer;

    // The Dafo token URI descriptor
    IDafoDescriptor public dafoDescriptor;

    // The address of the WETH contract
    address public weth;

    // The minimum amount of time left in an auction after a new bid is created
    uint256 public timeBuffer;

    // The minimum price accepted in an auction
    uint256 public reservePrice;

    // The minimum percentage difference between the last bid amount and the current bid
    uint8 public minBidIncrementPercentage;

    // The duration of a single auction
    uint256 public duration;

    // The active auction
    IDafoAuctionHouse.Auction public auction;

    /**
     * @notice Initialize the auction house and base contracts,
     * populate configuration values, and pause the contract.
     * @dev This function can only be called once.
     */
    function initialize(
        IDafoToken _dafoToken,
        IDafoCustomizer _dafoCustomizer,
        IDafoDescriptor _dafoDescriptor,
        address _weth,
        uint256 _timeBuffer,
        uint256 _reservePrice,
        uint8 _minBidIncrementPercentage,
        uint256 _duration
    ) external initializer {
        __Pausable_init();
        __ReentrancyGuard_init();
        __Ownable_init();

        _pause();

        dafoToken = _dafoToken;
        dafoCustomizer = _dafoCustomizer;
        dafoDescriptor = _dafoDescriptor;
        weth = _weth;
        timeBuffer = _timeBuffer;
        reservePrice = _reservePrice;
        minBidIncrementPercentage = _minBidIncrementPercentage;
        duration = _duration;
    }

    /**
     * @notice Settle the current auction and put a DafoToken up for auction.
     */
    function settleCurrentAndCreateNewAuction() external override nonReentrant whenNotPaused {
        _settleAuction();
        _createAuction();
    }

    /**
     * @notice Settle the current auction.
     * @dev This function can only be called when the contract is paused.
     */
    function settleAuction() external override whenPaused nonReentrant {
        _settleAuction();
    }

    /**
     * @notice Create a bid for a dafoToken, with a given amount.
     * @dev This contract only accepts payment in ETH.
     */
    function createBid(IDafoCustomizer.CustomInput calldata _customInput) external payable override nonReentrant {
        IDafoAuctionHouse.Auction memory _auction = auction;
        require(!dafoToken.exists(_customInput.tokenId), 'Cannot create bid on token that already exists');
        require(block.timestamp < _auction.endTime, 'Auction expired');
        require(msg.value >= reservePrice, 'Must send at least reservePrice');
        require(
            msg.value >= _auction.amount + ((_auction.amount * minBidIncrementPercentage) / 100),
            'Must send more than last bid by minBidIncrementPercentage amount'
        );
        dafoCustomizer.isInBounds(dafoDescriptor, _customInput);

        address payable lastBidder = _auction.bidder;

        // Refund the last bidder, if applicable
        if (lastBidder != address(0)) {
            _safeTransferETHWithFallback(lastBidder, _auction.amount);
        }

        auction.amount = msg.value;
        auction.bidder = payable(msg.sender);
        auction.customInput = _customInput;

        // Extend the auction if the bid was received within `timeBuffer` of the auction end time
        bool extended = _auction.endTime - block.timestamp < timeBuffer;
        if (extended) {
            auction.endTime = _auction.endTime = block.timestamp + timeBuffer;
        }

        emit AuctionBid(_auction.customInput.tokenId, msg.sender, msg.value, extended);

        if (extended) {
            emit AuctionExtended(_auction.customInput.tokenId, _auction.endTime);
        }
    }

    /**
     * @notice Pause the Dafo auction house.
     * @dev This function can only be called by the owner when the
     * contract is unpaused. While no new auctions can be started when paused,
     * anyone can settle an ongoing auction.
     */
    function pause() external override onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause the Dafo auction house.
     * @dev This function can only be called by the owner when the
     * contract is paused. If required, this function will start a new auction.
     */
    function unpause() external override onlyOwner {
        _unpause();

        if (auction.startTime == 0 || auction.settled) {
            _createAuction();
        }
    }

    /**
     * @notice Set the auction time buffer.
     * @dev Only callable by the owner.
     */
    function setTimeBuffer(uint256 _timeBuffer) external override onlyOwner {
        timeBuffer = _timeBuffer;

        emit AuctionTimeBufferUpdated(_timeBuffer);
    }

    /**
     * @notice Set the auction custom input.
     * @dev Only callable by the owner.
     */
    function setAuctionCustomInput(IDafoCustomizer.CustomInput calldata _customInput) external override onlyOwner {
        auction.customInput = _customInput;

        emit AuctionUpdated(auction);
    }

    /**
     * @notice Set the auction reserve price.
     * @dev Only callable by the owner.
     */
    function setReservePrice(uint256 _reservePrice) external override onlyOwner {
        reservePrice = _reservePrice;

        emit AuctionReservePriceUpdated(_reservePrice);
    }

    /**
     * @notice Set the auction minimum bid increment percentage.
     * @dev Only callable by the owner.
     */
    function setMinBidIncrementPercentage(uint8 _minBidIncrementPercentage) external override onlyOwner {
        minBidIncrementPercentage = _minBidIncrementPercentage;

        emit AuctionMinBidIncrementPercentageUpdated(_minBidIncrementPercentage);
    }

    /**
     * @notice Create an auction.
     * @dev Store the auction details in the `auction` state variable and emit an AuctionCreated event.
     * If the mint reverts, the minter was updated without pausing this contract first. To remedy this,
     * catch the revert and pause this contract.
     */
    function _createAuction() internal {
        uint256 startTime = block.timestamp;
        uint256 endTime = startTime + duration;
        IDafoCustomizer.CustomInput memory customInput = dafoCustomizer.create(0, 0, 0, false);

        auction = Auction({
            customInput: customInput,
            amount: 0,
            startTime: startTime,
            endTime: endTime,
            bidder: payable(0),
            settled: false
        });

        emit AuctionCreated(startTime, endTime);
    }

    /**
     * @notice Settle an auction, finalizing the bid and paying out to the owner.
     * @dev If there are no bids, the DafoToken is burned.
     */
    function _settleAuction() internal {
        IDafoAuctionHouse.Auction memory _auction = auction;
        require(_auction.startTime != 0, "Auction hasn't begun");
        require(!_auction.settled, 'Auction has already been settled');
        require(block.timestamp >= _auction.endTime, "Auction hasn't completed");

        auction.settled = true;

        if (_auction.bidder != address(0)) {
            try dafoToken.mint(auction.customInput, address(this)) returns (uint256 tokenId) {
                dafoToken.transferFrom(address(this), _auction.bidder, tokenId);
            } catch Error(string memory) {
                _pause();
            }
        }

        if (_auction.amount > 0) {
            _safeTransferETHWithFallback(owner(), _auction.amount);
        }

        emit AuctionSettled(_auction.customInput.tokenId, _auction.bidder, _auction.amount);
    }

    /**
     * @notice Transfer ETH. If the ETH transfer fails, wrap the ETH and try send it as WETH.
     */
    function _safeTransferETHWithFallback(address to, uint256 amount) internal {
        if (!_safeTransferETH(to, amount)) {
            IWETH(weth).deposit{value: amount}();
            IERC20(weth).transfer(to, amount);
        }
    }

    /**
     * @notice Transfer ETH and return the success status.
     * @dev This function only forwards 30,000 gas to the callee.
     */
    function _safeTransferETH(address to, uint256 value) internal returns (bool) {
        (bool success, ) = to.call{value: value, gas: 30_000}(new bytes(0));
        return success;
    }
}
