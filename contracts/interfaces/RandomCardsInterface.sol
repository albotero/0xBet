// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

interface IRandomCards {
    // Part of RandomCards.sol
    function requestRandomCards(uint32 count, address contractAddress) external;

    //Part of Calling Contract (i.e. PokerTable.sol)
    function obtainedRandomCards(uint256[] memory randomCards) external;
}
