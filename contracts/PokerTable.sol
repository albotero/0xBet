// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

/* Modules */
import "./BitOps.sol";
import "./interfaces/PokerHandsInterface.sol";
import "./interfaces/RandomCardsInterface.sol";

/* Errors */
error PokerTable__AlreadyRegistered();
error PokerTable__NotEnoughPlayersToPlay();
error PokerTable__MaximumPlayersReached();
error PokerTable__IsNotPlayer();
error PokerTable__PlayerNotFound();
error PokerTable__NoCheckAllowed();
error PokerTable__InsufficientBet();
error PokerTable__NotPlayersTurn();
error PokerTable__NoDirectTransferAllowed();
error PokerTable__GameAlreadyStarted();
error PokerTable__NoOngoingGame();
error PokerTable__OnlyVRFAllowed();

contract PokerTable {
    /* Library using*/

    using BitOps for uint64;
    using BitOps for uint256;

    /* Structs */

    struct Player {
        address payable playerAddress;
        bool folded;
        uint16 score;
        uint64 hand;
    }

    /* State variables */

    uint8 private constant TOTAL_CARDS_IN_DECK = 52;
    uint8 private constant MAX_PLAYERS = 9;
    uint8 private constant PLAYER_NOT_FOUND = 99;
    uint8 private s_currentButton;
    uint8 private s_currentPlayerIndex;
    uint8 private s_roundCount;
    bool private s_playingGame;
    bool private s_betDoneInRound;
    uint256 private s_unfoldedCardsCount;
    uint256 private s_lastBet;
    uint256 private s_unfoldedPlayers;
    uint8[] private s_randomCards;
    Player[] private s_players;
    address private immutable i_pokerHandsContractAddress;
    address private immutable i_randomCardsContractAddress;

    /* Events */

    event PokerTable__GameStarted(address indexed button, address indexed smallBlind, address indexed bigBlind);
    event PokerTable__DeckShuffled();
    event PokerTable__CardsUnfolded(address indexed player, uint256 cards);
    event PokerTable__Bet(address indexed player, uint256 amount);
    event PokerTable__HandScore(uint256 indexed maxScore);
    event PokerTable__ShowDown(Player[] players);
    event PokerTable__TransferFailed(address indexed playerAddress, uint256 amount);
    event PokerTable__NoWinnersToAward();
    event PokerTable__WinnersAwarded(address[] gameWinners);
    event PokerTable__OnlyOnePlayerLeft(address indexed playerAddress);
    event PokerTable__PlayerTurn(address indexed playerAddress);

    /* Modifiers */

    modifier OnlyPlayers() {
        if (getPlayerIndex(msg.sender) == PLAYER_NOT_FOUND) revert PokerTable__IsNotPlayer();
        _;
    }

    modifier GameStarted() {
        if (!s_playingGame) revert PokerTable__NoOngoingGame();
        _;
    }

    modifier PlayerWithTurn() {
        if (getPlayerIndex(msg.sender) != s_currentPlayerIndex) revert PokerTable__NotPlayersTurn();
        _;
    }

    modifier MultiplePlayersRequired() {
        if (s_players.length < 2) {
            // Require 2+ players registered to keep table, transfer all funds to the only player left
            emit PokerTable__OnlyOnePlayerLeft(s_players[0].playerAddress);
            selfdestruct(s_players[0].playerAddress);
        }
        // Require 2+ unfolded players to continue current game
        if (s_unfoldedPlayers.getBitCount() < 2) finishGame();
        _;
    }

    /* Main functions */

    constructor(address pokerHandsContractAddress, address randomCardsContractAddress) {
        i_pokerHandsContractAddress = pokerHandsContractAddress;
        i_randomCardsContractAddress = randomCardsContractAddress;
        registerPlayer();
    }

    receive() external payable {
        // Don't allow direct transfers to pot
        revert PokerTable__NoDirectTransferAllowed();
    }

    /* Players functions */

    function registerPlayer() public {
        uint256 playersLength = s_players.length;
        if (getPlayerIndex(msg.sender) != PLAYER_NOT_FOUND) revert PokerTable__AlreadyRegistered();
        if (playersLength == MAX_PLAYERS) revert PokerTable__MaximumPlayersReached();
        s_players.push(Player({playerAddress: payable(msg.sender), folded: false, score: 0, hand: 0}));
        // Set player as unfolded, so he/she can play
        s_unfoldedPlayers = s_unfoldedPlayers.setBitAtIndex(playersLength);
    }

    function removePlayer() external OnlyPlayers {
        uint256 playerIndex = getPlayerIndex(msg.sender);
        // Cache players
        Player[] memory players = s_players;
        uint256 unfoldedPlayers = 0;
        // Remove the player
        unchecked {
            for (uint256 i = 0; i < players.length - 1; i++) {
                // Copy next player to its new location starting from playerIndex
                if (i + 1 > playerIndex) {
                    players[i] = players[i + 1];
                    s_players[i] = players[i];
                }
                // Update unfolded players
                if (!players[i].folded) unfoldedPlayers = unfoldedPlayers.setBitAtIndex(i);
            }
        }
        s_players.pop();
        s_unfoldedPlayers = unfoldedPlayers;
        uint8 currentPlayerIndex = s_currentPlayerIndex;
        if (unfoldedPlayers.getBitCount() < 2)
            // Only one player has remained, call nextPlayerTurn to call modifier MultiplePlayersRequired
            nextPlayerTurn();
        else if (currentPlayerIndex > playerIndex)
            // Turn was after deleted player, decrease current turn's index
            s_currentPlayerIndex = currentPlayerIndex - 1;
        else if (currentPlayerIndex == playerIndex) {
            // If the player had the turn, currentPlayerIndex now points to the next remaining player
            // Decrease currentPlayerIndex and then increase it again with nextPlayerTurn
            // Use modulo to avoid underflow (i.e. negative value of currentPlayerIndex if previous was 0)
            uint8 playersLength = uint8(players.length) - 1;
            s_currentPlayerIndex = (playersLength + currentPlayerIndex - 1) % playersLength;
            nextPlayerTurn();
        }
    }

    function nextPlayerTurn() internal MultiplePlayersRequired {
        uint8 prevPlayerIndex = s_currentPlayerIndex;
        uint8 nextPlayerIndex = calculateNextPlayer(prevPlayerIndex, s_players.length);
        s_currentPlayerIndex = nextPlayerIndex;
        if (prevPlayerIndex == s_currentButton) newRound();
        emit PokerTable__PlayerTurn(s_players[nextPlayerIndex].playerAddress);
    }

    function foldPlayer() external GameStarted OnlyPlayers {
        uint256 playerIndex = getPlayerIndex(msg.sender);
        s_players[playerIndex].folded = true;
        s_unfoldedPlayers = s_unfoldedPlayers.unsetBitAtIndex(playerIndex);
        // Require 2+ unfolded players to continue current game
        if (s_unfoldedPlayers.getBitCount() < 2) finishGame();
        else if (playerIndex == s_currentPlayerIndex) nextPlayerTurn();
    }

    function checkTurn() external OnlyPlayers GameStarted PlayerWithTurn {
        if (s_betDoneInRound || s_roundCount < 2) revert PokerTable__NoCheckAllowed();
        nextPlayerTurn();
    }

    function betToPot() external payable OnlyPlayers GameStarted PlayerWithTurn {
        if (msg.value < s_lastBet) revert PokerTable__InsufficientBet();
        uint256 playersLength = s_players.length;
        uint256 playersToUnfold;
        if (s_roundCount == 1) {
            /* Pre-Flop, bigBlind has bet, unfold cards */
            uint256 bigBlindIndex = calculateNextPlayer(
                calculateNextPlayer(s_currentButton, playersLength),
                playersLength
            );
            if (msg.sender == s_players[bigBlindIndex].playerAddress) {
                unchecked {
                    // playerIndex base 1
                    for (uint8 p = 0; p < playersLength; p++)
                        playersToUnfold = playersToUnfold.appendNumberToData(p + 1);
                    unfoldCards(playersToUnfold, false);
                }
            }
        }
        s_lastBet = msg.value;
        s_betDoneInRound = true;
        nextPlayerTurn();
        emit PokerTable__Bet(msg.sender, msg.value);
    }

    /* Game functions */

    function startGame() public {
        // Only one game at a time
        if (s_playingGame) revert PokerTable__GameAlreadyStarted();
        else s_playingGame = true;
        // Cache players
        Player[] memory players = s_players;
        // Initialise players
        if (players.length < 2) revert PokerTable__NotEnoughPlayersToPlay();
        unchecked {
            for (uint256 p = 0; p < players.length; p++) {
                players[p].score = 0;
                players[p].hand = 0;
                players[p].folded = false;
                s_unfoldedPlayers = s_unfoldedPlayers.setBitAtIndex(p);
            }
        }
        // Get random order for cards to unfold, base 1
        // In the whole game, cards to be unfolded are: 2*players + 3 flop + 1 turn + 1 river
        uint256 randomCount = 2 * players.length + 5;
        IRandomCards(i_randomCardsContractAddress).requestRandomCards(uint32(randomCount), address(this));
        // Update cached players
        for (uint256 p = 0; p < players.length; p++) s_players[p] = players[p];
        // Emit event
        uint8 button = s_currentButton;
        uint8 smallBlind = calculateNextPlayer(button, players.length);
        uint8 bigBlind = calculateNextPlayer(smallBlind, players.length);
        emit PokerTable__GameStarted(
            players[button].playerAddress,
            players[smallBlind].playerAddress,
            players[bigBlind].playerAddress
        );
        // Start rounds
        nextPlayerTurn();
    }

    function obtainedRandomCards(uint256[] calldata _randomCards) external {
        if (msg.sender != i_randomCardsContractAddress) revert PokerTable__OnlyVRFAllowed();
        uint256 cardCount = _randomCards.length;
        uint8[] memory randomCards = new uint8[](cardCount);
        unchecked {
            // cardIndex base 1
            for (uint256 i = 0; i < cardCount; i++) randomCards[i] = uint8(_randomCards[i] % TOTAL_CARDS_IN_DECK) + 1;
        }
        s_randomCards = randomCards;
        emit PokerTable__DeckShuffled();
    }

    function newRound() internal {
        uint8 roundCount = s_roundCount;
        if (roundCount == 1 /* Flop */) unfoldCommunityCard(3);
        else if (roundCount == 2 /* Turn */) unfoldCommunityCard(1);
        else if (roundCount == 3 /* River */) unfoldCommunityCard(1);
        else if (roundCount == 4 /* Showdown */) finishGame();
        s_roundCount = roundCount + 1;
        s_betDoneInRound = false;
    }

    function unfoldCommunityCard(uint256 _numCards) internal {
        unchecked {
            unfoldCards(_numCards, true);
        }
    }

    /**
     * @param _playersToUnfold Encoded players index base 1, or number of cards if they are community cards
     * @param _communityCards If cards to unfold are community cards
     */
    function unfoldCards(uint256 _playersToUnfold, bool _communityCards) internal {
        // Cache storage
        Player[] memory players = s_players;
        uint256 previousUnfoldedCards = s_unfoldedCardsCount;
        if (_communityCards) {
            // Unfold the card to each player
            uint256 cardsToPlayer;
            for (uint256 i = 0; i < _playersToUnfold /* # cards to unfold */; i++)
                cardsToPlayer = cardsToPlayer.appendNumberToData(s_randomCards[i + previousUnfoldedCards]);
            for (uint256 playerToUnfold = players.length; playerToUnfold > 0; ) {
                playerToUnfold--;
                s_players[playerToUnfold].hand = players[playerToUnfold].hand.setBitsAtIndexBase1To0(cardsToPlayer);
                emit PokerTable__CardsUnfolded(players[playerToUnfold].playerAddress, cardsToPlayer);
            }
        } else {
            // Pre-flop => 2 cards per player
            while (_playersToUnfold > 0) {
                // playerIndex base 1
                uint256 player = (_playersToUnfold & 0x0F) - 1;
                uint256 cardsToPlayer;
                for (uint256 i = 0; i < 2; i++)
                    cardsToPlayer = cardsToPlayer.appendNumberToData(s_randomCards[i + previousUnfoldedCards]);
                // Unfold
                s_players[player].hand = players[player].hand.setBitsAtIndexBase1To0(cardsToPlayer);
                emit PokerTable__CardsUnfolded(players[player].playerAddress, cardsToPlayer);
                // Update counter
                previousUnfoldedCards += 2;
                // Shift the data to set the next player at the last byte
                _playersToUnfold >>= 8;
            }
        }
        s_unfoldedCardsCount = previousUnfoldedCards;
    }

    function scoreHand(uint64 _value) public returns (uint16 maxScore) {
        unchecked {
            // To get the best 5-card hand in the 7 cards unfolded, iterates removing 2 cards at a time
            uint8[7] memory bitPositions = _value.getBitPositions();
            // First card not to be in the hand
            for (uint256 c1 = 0; c1 < 7; c1++) {
                // Second hand not to be in the hand
                for (uint256 c2 = c1 + 1; c2 < 7; c2++) {
                    // Remove both cards from the hand and score the 5-card hand
                    uint256[] memory cards = new uint256[](2);
                    cards[0] = bitPositions[c1];
                    cards[1] = bitPositions[c2];
                    uint64 value = _value.unSetBitsAtIndex(cards);
                    uint16 score = IPokerHands(i_pokerHandsContractAddress).getScore(value);
                    if (score > maxScore) maxScore = score;
                }
            }
        }
        emit PokerTable__HandScore(maxScore);
    }

    /**
     * @notice Called at showdown or if all players but one have folded or resigned
     */
    function finishGame() internal {
        // Cache players
        Player[] memory players = s_players;
        uint8 playersLength = uint8(players.length);
        // ShowDown => Score hands, get winner(s) & clear hands
        uint256 maxScore;
        uint256 winnersCount;
        address[] memory winners = new address[](playersLength);
        unchecked {
            for (uint8 p = 0; p < playersLength; p++) {
                if (players[p].folded) continue;
                players[p].score = scoreHand(players[p].hand);
                if (players[p].score > maxScore) {
                    maxScore = players[p].score;
                    winners = new address[](playersLength - p);
                    winnersCount = 0;
                }
                if (players[p].score == maxScore) {
                    winners[winnersCount] = players[p].playerAddress;
                    winnersCount++;
                }
            }
        }
        // Reset the game
        s_playingGame = false;
        s_lastBet = 0;
        s_currentButton = calculateNextPlayer(s_currentButton, playersLength);
        s_unfoldedCardsCount = 0;
        s_roundCount = 0;
        // Emit event with players scores to frontend
        emit PokerTable__ShowDown(players);
        // Make sure pot has balance to award
        uint256 potBalance = address(this).balance;
        if (potBalance > 0) {
            // Transfer funds from Pot to the winner(s) and clear the winners list
            uint256 amountPerWinner = potBalance / winnersCount;
            while (winnersCount > 0) {
                winnersCount--;
                (bool success, ) = winners[winnersCount].call{value: amountPerWinner}("");
                if (!success) {
                    emit PokerTable__TransferFailed(winners[winnersCount], amountPerWinner);
                    winners[winnersCount] = address(0);
                }
            }
            emit PokerTable__WinnersAwarded(winners);
        } else emit PokerTable__NoWinnersToAward();
    }

    /* View/Pure functions */

    function getPlayerIndex(address _playerToCheck) internal view returns (uint256 playerIndex) {
        unchecked {
            for (playerIndex = s_players.length; playerIndex > 0; ) {
                playerIndex--;
                if (s_players[playerIndex].playerAddress == _playerToCheck) return playerIndex;
            }
        }
        return PLAYER_NOT_FOUND;
    }

    function calculateNextPlayer(uint8 index, uint256 playersLength) internal view returns (uint8 next) {
        next = index;
        // Iterate playersLength times to get the next unfolded player
        for (uint256 i = 0; i < playersLength; i++) {
            next = uint8((next + 1) % playersLength);
            if (!s_players[next].folded) return next;
        }
    }

    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function getPlayerBalance(address _player) external view returns (uint256) {
        return _player.balance;
    }

    function getPlayers() external view returns (Player[] memory) {
        return s_players;
    }

    function getCurrentPlayer() external view returns (Player memory) {
        return s_players[s_currentPlayerIndex];
    }

    function getCurrentButton() external view returns (Player memory) {
        return s_players[s_currentButton];
    }

    function getLastBet() external view returns (uint256) {
        return s_lastBet;
    }
}
