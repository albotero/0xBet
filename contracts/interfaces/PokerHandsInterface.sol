// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

interface IPokerHands {
    function getScore(uint64 hand) external returns (uint16);
}
