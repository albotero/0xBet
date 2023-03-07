// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./BitOps.sol";
import "./interfaces/PokerHandsInterface.sol";

/**@title Poker scoring system
 * @author Alejandro Botero
 * @notice Gets a score of a given poker hand
 * @dev A score is calculated the first time each specific hand is required
 * @dev then stored making cheaper to get the score at every subsequent use,
 * @dev just by reading the already populated mapping
 */
contract PokerHands is IPokerHands {
    using BitOps for uint64;

    mapping(uint64 => uint16) private s_hands;

    function getScore(uint64 hand) external returns (uint16 score) {
        // Cache the score
        score = s_hands[hand];
        // If score doesn't exists, calculate it and add to the mapping for next calls
        if (score == 0) {
            score = calcScore(hand);
            s_hands[hand] = score;
        }
    }

    /**
     * @dev Better possible card combination is royal flush:
     * @dev AAAAKKKKQQQQJJJJTTTT99998888777766665555444433332222------------ => T:10
     * @dev 1000100010001000100000000000000000000000000000000000000000000000 => 52 bits (fits in an uint64)
     * @dev Max score with royal flush: 14+13+12+11+10+900 = 960 => 10 bits (fits in an uint16)
     * @dev Min score with a high card: 7+5+4+3+2 = 21
     * @param _5CardHand Encoded cards
     */
    function calcScore(uint64 _5CardHand) internal pure returns (uint16 score) {
        uint64[4] memory suits = [
            0x8888888888888888, // spades   [1000]
            0x4444444444444444, // hearts   [0100]
            0x2222222222222222, // diamonds [0010]
            0x1111111111111111 //  clubs    [0001]
        ];
        uint8[16] memory _nibbles = _5CardHand.getNibbles();
        bool isFlush;
        bool isRoyalFlush;
        bool is4OfAKind;
        bool isFullHouse;
        bool has3OfAKind;
        uint8 pairCount;
        uint8 straightCount;
        // Assess flush
        for (uint256 s = 0; s < 4; s++) {
            uint64 suitValue = _5CardHand & suits[s];
            if (suitValue.getBitCount() > 4) isFlush = true;
        }
        for (uint16 n = 0; n < 13; n++) {
            // Check the nibble
            if (_nibbles[n] == 0) {
                // Empty nibble, no need to analize it
                straightCount = 0;
                continue;
            }
            // Count cards
            uint256 bitCount = uint64(_nibbles[n]).getBitCount();
            score += (14 - n) * uint16(bitCount);
            straightCount++;
            if (bitCount == 2) pairCount++;
            else if (bitCount == 3) has3OfAKind = true;
            else if (bitCount == 4) is4OfAKind = true;
            // Aces low
            if (n == 12 && straightCount == 4 && _nibbles[0] > 0) {
                straightCount = 5;
                score -= 13;
            }
            // Break iteration if no best score is possible with this hand
            if (straightCount == 5) {
                // Royal flush if rank is 10
                if (n == 4 && isFlush) isRoyalFlush = true;
                break;
            }
            if (has3OfAKind && pairCount == 1) {
                isFullHouse = true;
                break;
            }
        }
        // Special scores
        if (isRoyalFlush) score += 900;
        else if (straightCount == 5 && isFlush) score += 800;
        else if (is4OfAKind) score += 700;
        else if (isFullHouse) score += 600;
        else if (isFlush) score += 500;
        else if (straightCount == 5) score += 400;
        else if (has3OfAKind) score += 300;
        else if (pairCount == 2) score += 200;
        else if (pairCount == 1) score += 100;
    }
}
