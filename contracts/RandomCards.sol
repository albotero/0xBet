// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "./interfaces/RandomCardsInterface.sol";

//error RandomCards__RequestNotFound();
//error RandomCards__RequestNotFulfilled();

contract RandomCards is VRFConsumerBaseV2 {
    event RequestSent(uint256 requestId, uint32 numWords);
    event RequestFulfilled(uint256 requestId, uint256[] randomWords);

    struct RequestStatus {
        bool fulfilled; // whether the request has been successfully fulfilled
        bool exists; // whether a requestId exists
        uint256[] randomWords;
    }

    mapping(uint256 => RequestStatus) public s_requests; /* requestId --> requestStatus */
    VRFCoordinatorV2Interface private immutable i_vrfCoordinatorV2;

    uint64 s_subscriptionId;
    bytes32 s_gasLane;
    uint16 s_requestConfirmations;
    uint32 s_callbackGasLimit;
    uint32 s_count;
    address s_callerAddress;

    // past requests Id.
    uint256[] public s_requestIds;
    uint256 public s_lastRequestId;

    constructor(
        address coordinatorV2Address,
        bytes32 gasLane,
        uint64 subscriptionId,
        uint16 requestConfirmations,
        uint32 callbackGasLimit
    ) VRFConsumerBaseV2(coordinatorV2Address) {
        i_vrfCoordinatorV2 = VRFCoordinatorV2Interface(coordinatorV2Address);
        s_gasLane = gasLane;
        s_subscriptionId = subscriptionId;
        s_requestConfirmations = requestConfirmations;
        s_callbackGasLimit = callbackGasLimit;
    }

    // Assumes the subscription is funded sufficiently.
    function requestRandomWords() internal returns (uint256 requestId) {
        // Will revert if subscription is not set and funded.
        requestId = i_vrfCoordinatorV2.requestRandomWords(
            s_gasLane,
            s_subscriptionId,
            s_requestConfirmations,
            s_callbackGasLimit,
            s_count
        );
        s_requests[requestId] = RequestStatus({randomWords: new uint256[](0), exists: true, fulfilled: false});
        s_requestIds.push(requestId);
        s_lastRequestId = requestId;
        return requestId;
    }

    function fulfillRandomWords(uint256 _requestId, uint256[] memory _randomWords) internal override {
        //if (!s_requests[_requestId].exists) revert RandomCards__RequestNotFound();
        s_requests[_requestId].fulfilled = true;
        s_requests[_requestId].randomWords = _randomWords;
        IRandomCards(s_callerAddress).obtainedRandomCards(_randomWords);
    }

    function requestRandomCards(uint32 count, address callerAddress) external {
        s_count = count;
        s_callerAddress = callerAddress;
        requestRandomWords();
    }
}
