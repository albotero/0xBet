// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import "../PokerTable.sol";

error NotReceiverAddressMock__NotAllowed();

interface IPokerTable {
    function registerPlayer() external;
}

contract NotReceiverAddressMock {
    receive() external payable {
        revert NotReceiverAddressMock__NotAllowed();
    }

    function register(address pokerTableContract) external {
        IPokerTable(pokerTableContract).registerPlayer();
    }
}
