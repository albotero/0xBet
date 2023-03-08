const { network, deployments, ethers } = require("hardhat")
const { expect, assert } = require("chai")
const { developmentChains, ERC20_BET_DECIMALS } = require("../../helper-hardhat-config")

const countBytes = (_data) => {
    let count = 0
    while (_data) {
        if (_data & 0xff) count++
        _data >>= 8
    }
    return count
}

const getRandomCards = ({ playersCount }) => {
    const cardsCount = 2 * playersCount + 5
    let cards = []
    for (let i = 0; i < cardsCount; i++) cards.push(Math.floor(Math.random() * 1e18, 0).toString())
    return cards
}

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("PokerTable", function () {
          let pokerTable, randomCards, vrfCoordinatorV2Mock, accounts

          beforeEach(async function () {
              accounts = await ethers.getSigners()
              await deployments.fixture(["all"])
              const _pokerTable = await deployments.get("PokerTable")
              pokerTable = await ethers.getContractAt(_pokerTable.abi, _pokerTable.address)
              const _randomCards = await deployments.get("RandomCards")
              randomCards = await ethers.getContractAt(_randomCards.abi, _randomCards.address)
              const _vrfCoordinatorV2Mock = await deployments.get("VRFCoordinatorV2Mock")
              vrfCoordinatorV2Mock = await ethers.getContractAt(
                  _vrfCoordinatorV2Mock.abi,
                  _vrfCoordinatorV2Mock.address
              )
          })

          it("Initializes with one player", async function () {
              const players = await pokerTable.getPlayers()
              assert.equal(players.length, 1)
          })

          it("Doesn't allow to bet if game has not started yet", async function () {
              await expect(
                  pokerTable.betToPot({ value: ethers.utils.parseUnits("0.01", ERC20_BET_DECIMALS) })
              ).to.be.revertedWithCustomError(pokerTable, "PokerTable__NoOngoingGame")
          })

          it("Only one registration per user", async function () {
              await expect(pokerTable.registerPlayer()).to.be.revertedWithCustomError(
                  pokerTable,
                  "PokerTable__AlreadyRegistered"
              )
          })

          it("Max 9 players", async function () {
              // First player is deployer, add other 8 to reach 9
              for (let p = 1; p < 9; p++) await pokerTable.connect(accounts[p]).registerPlayer()
              // Try to add tenth player
              await expect(pokerTable.connect(accounts[9]).registerPlayer()).to.be.revertedWithCustomError(
                  pokerTable,
                  "PokerTable__MaximumPlayersReached"
              )
          })

          it("Only a player can bet", async function () {
              const val = ethers.utils.parseUnits("0.01", ERC20_BET_DECIMALS)
              // Register one player to allow betting
              await pokerTable.connect(accounts[1]).registerPlayer()
              await pokerTable.startGame()
              await expect(
                  vrfCoordinatorV2Mock.fulfillRandomWordsWithOverride(
                      await randomCards.s_lastRequestId(),
                      randomCards.address,
                      getRandomCards({ playersCount: 2 })
                  )
              ).to.emit(pokerTable, "PokerTable__DeckShuffled")
              // Small blind
              await pokerTable.connect(accounts[1]).betToPot({ value: val })
              // Bet with an unregistered player
              await expect(pokerTable.connect(accounts[2]).betToPot({ value: val })).to.be.revertedWithCustomError(
                  pokerTable,
                  "PokerTable__IsNotPlayer"
              )
          })

          it("Require 2+ players to start a game", async function () {
              await expect(pokerTable.startGame()).to.be.revertedWithCustomError(
                  pokerTable,
                  "PokerTable__NotEnoughPlayersToPlay"
              )
          })

          it("Change small and big blinds each game", async function () {
              // Register some players
              for (let p = 1; p < 4; p++) await pokerTable.connect(accounts[p]).registerPlayer()
              // Owner is button, Player1 is smallBlind and Player2 is bigBlind
              await expect(pokerTable.startGame())
                  .to.emit(pokerTable, "PokerTable__GameStarted")
                  .withArgs(
                      (button) => button == accounts[0].address,
                      (small) => small == accounts[1].address,
                      (big) => big == accounts[2].address
                  )
              await expect(
                  vrfCoordinatorV2Mock.fulfillRandomWordsWithOverride(
                      await randomCards.s_lastRequestId(),
                      randomCards.address,
                      getRandomCards({ playersCount: 4 })
                  )
              ).to.emit(pokerTable, "PokerTable__DeckShuffled")
              // Bet until game ends
              const val = ethers.utils.parseUnits("0.01", ERC20_BET_DECIMALS)
              for (let i = 1; i < 4 * 4; i++) await pokerTable.connect(accounts[i % 4]).betToPot({ value: val })
              await expect(pokerTable.connect(accounts[0]).betToPot({ value: val })).to.emit(
                  pokerTable,
                  "PokerTable__ShowDown"
              )
              // New game => Now Player1 is button, Player2 is smallBlind and Player3 is bigBlind
              await expect(pokerTable.startGame())
                  .to.emit(pokerTable, "PokerTable__GameStarted")
                  .withArgs(
                      (button) => button == accounts[1].address,
                      (small) => small == accounts[2].address,
                      (big) => big == accounts[3].address
                  )
          })

          it("Small and big blinds in a 2-player game", async function () {
              // Register one player to allow betting
              await pokerTable.connect(accounts[1]).registerPlayer()
              // Owner is button and bigBlind, Player1 is smallBlind
              await expect(pokerTable.startGame())
                  .to.emit(pokerTable, "PokerTable__GameStarted")
                  .withArgs(
                      (button) => button == accounts[0].address,
                      (small) => small == accounts[1].address,
                      (big) => big == accounts[0].address
                  )
              // Fold one player to finish current game
              await expect(pokerTable.foldPlayer()).to.emit(pokerTable, "PokerTable__ShowDown")
              // New game => Now Player1 is button and bigBlind, Owner is smallBlind
              await expect(pokerTable.startGame())
                  .to.emit(pokerTable, "PokerTable__GameStarted")
                  .withArgs(
                      (button) => button == accounts[1].address,
                      (small) => small == accounts[0].address,
                      (big) => big == accounts[1].address
                  )
          })

          it("Only player with turn can bet", async function () {
              const val = ethers.utils.parseUnits("250", ERC20_BET_DECIMALS)
              // Register one player to allow betting
              pokerTable = pokerTable.connect(accounts[1])
              await pokerTable.registerPlayer()
              await pokerTable.startGame()
              await expect(pokerTable.connect(accounts[0]).betToPot({ value: val })).to.be.revertedWithCustomError(
                  pokerTable,
                  "PokerTable__NotPlayersTurn"
              )
          })

          it("Can't bet a lesser amount than previous bet", async function () {
              // Register player
              pokerTable = pokerTable.connect(accounts[1])
              await pokerTable.registerPlayer()
              await pokerTable.startGame()
              // Small blind
              await pokerTable.betToPot({ value: ethers.utils.parseUnits("0.02", ERC20_BET_DECIMALS) })
              // Big blind
              await expect(
                  pokerTable
                      .connect(accounts[0])
                      .betToPot({ value: ethers.utils.parseUnits("0.01", ERC20_BET_DECIMALS) })
              ).to.be.revertedWithCustomError(pokerTable, "PokerTable__InsufficientBet")
          })

          it("Pass turn from last to first player", async function () {
              const val = ethers.utils.parseUnits("250", ERC20_BET_DECIMALS)
              // Register one player to allow betting
              pokerTable = pokerTable.connect(accounts[1])
              await pokerTable.registerPlayer()
              await pokerTable.startGame()
              await expect(
                  vrfCoordinatorV2Mock.fulfillRandomWordsWithOverride(
                      await randomCards.s_lastRequestId(),
                      randomCards.address,
                      getRandomCards({ playersCount: 2 })
                  )
              ).to.emit(pokerTable, "PokerTable__DeckShuffled")
              // Bet to pass turn to the next player
              await pokerTable.betToPot({ value: val })
              let currentTurn = await pokerTable.getCurrentPlayer()
              assert.equal(currentTurn.playerAddress, accounts[0].address)
              // Bet to pass turn to the next player
              await pokerTable.connect(accounts[0]).betToPot({ value: val })
              currentTurn = await pokerTable.getCurrentPlayer()
              assert.equal(currentTurn.playerAddress, accounts[1].address)
          })

          it("Player with turn folds", async function () {
              // Register some players
              for (let p = 1; p < 6; p++) await pokerTable.connect(accounts[p]).registerPlayer()
              await pokerTable.startGame()
              await expect(
                  vrfCoordinatorV2Mock.fulfillRandomWordsWithOverride(
                      await randomCards.s_lastRequestId(),
                      randomCards.address,
                      getRandomCards({ playersCount: 6 })
                  )
              ).to.emit(pokerTable, "PokerTable__DeckShuffled")
              // Small and big blinds
              const val = ethers.utils.parseUnits("250", ERC20_BET_DECIMALS)
              await pokerTable.connect(accounts[1]).betToPot({ value: val })
              await pokerTable.connect(accounts[2]).betToPot({ value: val })
              // Player with turn folds
              await expect(pokerTable.connect(accounts[3]).foldPlayer())
                  .to.emit(pokerTable, "PokerTable__PlayerTurn")
                  .withArgs((address) => address == accounts[4].address)
              // Check owner is folded
              const players = await pokerTable.getPlayers()
              assert.isTrue(players[3].folded)
              // Check turn has passed to next player
              const currentTurn = await pokerTable.getCurrentPlayer()
              assert.equal(currentTurn.playerAddress, accounts[4].address)
          })

          it("Player without turn folds", async function () {
              // Register one player to fold
              pokerTable = pokerTable.connect(accounts[1])
              await pokerTable.registerPlayer()
              await pokerTable.startGame()
              // Owner has the turn, player1 folds
              const previousTurn = await pokerTable.getCurrentPlayer()
              await pokerTable.foldPlayer()
              // Check player is folded
              const players = await pokerTable.getPlayers()
              assert.isTrue(players[1].folded)
              // Check turn hasn't changed
              const currentTurn = await pokerTable.getCurrentPlayer()
              assert.equal(currentTurn.playerAddress, previousTurn.playerAddress)
          })

          it("Only a player can fold", async function () {
              // Register one player and start game
              pokerTable = pokerTable.connect(accounts[1])
              await pokerTable.registerPlayer()
              await pokerTable.startGame()
              // Try to fold with a non player account
              await expect(pokerTable.connect(accounts[2]).foldPlayer()).to.be.revertedWithCustomError(
                  pokerTable,
                  "PokerTable__IsNotPlayer"
              )
          })

          it("Only can fold if game is started", async function () {
              await expect(pokerTable.connect(accounts[0]).foldPlayer()).to.be.revertedWithCustomError(
                  pokerTable,
                  "PokerTable__NoOngoingGame"
              )
          })

          it("Only a player can quit", async function () {
              await expect(pokerTable.connect(accounts[1]).removePlayer()).to.be.revertedWithCustomError(
                  pokerTable,
                  "PokerTable__IsNotPlayer"
              )
          })

          it("To check, it must be a player, game has to be started, round has to be > pre-flop, and player has to have the turn", async function () {
              pokerTable = pokerTable.connect(accounts[1])
              // OnlyPlayers
              await expect(pokerTable.checkTurn()).to.be.revertedWithCustomError(pokerTable, "PokerTable__IsNotPlayer")
              // GameStarted
              await pokerTable.registerPlayer()
              await expect(pokerTable.checkTurn()).to.be.revertedWithCustomError(
                  pokerTable,
                  "PokerTable__NoOngoingGame"
              )
              // Round > pre-flop
              await pokerTable.startGame()
              await expect(
                  vrfCoordinatorV2Mock.fulfillRandomWordsWithOverride(
                      await randomCards.s_lastRequestId(),
                      randomCards.address,
                      getRandomCards({ playersCount: 2 })
                  )
              ).to.emit(pokerTable, "PokerTable__DeckShuffled")
              await expect(pokerTable.checkTurn()).to.be.revertedWithCustomError(
                  pokerTable,
                  "PokerTable__NoCheckAllowed"
              )
              // Small and big blinds
              const val = ethers.utils.parseUnits("250", ERC20_BET_DECIMALS)
              await pokerTable.connect(accounts[1]).betToPot({ value: val })
              await pokerTable.connect(accounts[0]).betToPot({ value: val })
              // PlayerWithTurn
              await expect(pokerTable.connect(accounts[0]).checkTurn()).to.be.revertedWithCustomError(
                  pokerTable,
                  "PokerTable__NotPlayersTurn"
              )
              // Allow check
              await pokerTable.connect(accounts[1]).checkTurn()
          })

          it("Only allows a player to check if no bets have been done in current round", async function () {
              await pokerTable.connect(accounts[1]).registerPlayer()
              await pokerTable.startGame()
              await expect(
                  vrfCoordinatorV2Mock.fulfillRandomWordsWithOverride(
                      await randomCards.s_lastRequestId(),
                      randomCards.address,
                      getRandomCards({ playersCount: 2 })
                  )
              ).to.emit(pokerTable, "PokerTable__DeckShuffled")
              await pokerTable
                  .connect(accounts[1])
                  .betToPot({ value: ethers.utils.parseUnits("0.01", ERC20_BET_DECIMALS) })
              await expect(pokerTable.connect(accounts[0]).checkTurn()).to.be.revertedWithCustomError(
                  pokerTable,
                  "PokerTable__NoCheckAllowed"
              )
          })

          describe("Game Initialization", function () {
              beforeEach(async function () {
                  // Register some players
                  for (let p = 1; p < 6; p++) await pokerTable.connect(accounts[p]).registerPlayer()
              })

              it("Only one game at a time", async function () {
                  await pokerTable.startGame()
                  await expect(pokerTable.startGame()).to.be.revertedWithCustomError(
                      pokerTable,
                      "PokerTable__GameAlreadyStarted"
                  )
              })

              it("Only allow RandomCards contract to update Random Cards", async function () {
                  await pokerTable.startGame()
                  await expect(
                      pokerTable.obtainedRandomCards(getRandomCards({ playersCount: 6 }))
                  ).to.be.revertedWithCustomError(pokerTable, "PokerTable__OnlyVRFAllowed")
              })

              it("6 players are registered (owner + other 5)", async function () {
                  const players = await pokerTable.getPlayers()
                  assert.equal(players.length, 6)
              })

              it("12 cards are unfolded (2 x players) at Pre-Flop", async function () {
                  await pokerTable.startGame()
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWordsWithOverride(
                          await randomCards.s_lastRequestId(),
                          randomCards.address,
                          getRandomCards({ playersCount: 6 })
                      )
                  ).to.emit(pokerTable, "PokerTable__DeckShuffled")
                  // Small blind bet
                  const val = ethers.utils.parseUnits("0.01", ERC20_BET_DECIMALS)
                  await pokerTable.connect(accounts[1]).betToPot({ value: val })
                  // Unfold 2 cards to each player after big blind bet
                  await expect(pokerTable.connect(accounts[2]).betToPot({ value: val }))
                      .to.emit(pokerTable, "PokerTable__CardsUnfolded")
                      .withArgs(
                          (address) => address == accounts[0].address,
                          (cards) => countBytes(cards) == 2
                      )
                      .to.emit(pokerTable, "PokerTable__CardsUnfolded")
                      .withArgs(
                          (address) => address == accounts[1].address,
                          (cards) => countBytes(cards) == 2
                      )
                      .to.emit(pokerTable, "PokerTable__CardsUnfolded")
                      .withArgs(
                          (address) => address == accounts[2].address,
                          (cards) => countBytes(cards) == 2
                      )
                      .to.emit(pokerTable, "PokerTable__CardsUnfolded")
                      .withArgs(
                          (address) => address == accounts[3].address,
                          (cards) => countBytes(cards) == 2
                      )
                      .to.emit(pokerTable, "PokerTable__CardsUnfolded")
                      .withArgs(
                          (address) => address == accounts[4].address,
                          (cards) => countBytes(cards) == 2
                      )
                      .to.emit(pokerTable, "PokerTable__CardsUnfolded")
                      .withArgs(
                          (address) => address == accounts[5].address,
                          (cards) => countBytes(cards) == 2
                      )
              })

              it("Unfold community cards at Flop", async function () {
                  await pokerTable.startGame()
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWordsWithOverride(
                          await randomCards.s_lastRequestId(),
                          randomCards.address,
                          getRandomCards({ playersCount: 6 })
                      )
                  ).to.emit(pokerTable, "PokerTable__DeckShuffled")
                  // Bet to get to the next rounds (pre-flop and flop)
                  const val = ethers.utils.parseUnits("0.01", ERC20_BET_DECIMALS)
                  for (let i = 1; i < 6; i++) await pokerTable.connect(accounts[i % 6]).betToPot({ value: val })
                  // Unfold first 3 community cards, in game is after two bet rounds
                  await expect(pokerTable.connect(accounts[0]).betToPot({ value: val }))
                      .to.emit(pokerTable, "PokerTable__CardsUnfolded")
                      .withArgs(
                          (address) => address == accounts[0].address,
                          (cards) => countBytes(cards) == 3
                      )
                      .to.emit(pokerTable, "PokerTable__CardsUnfolded")
                      .withArgs(
                          (address) => address == accounts[1].address,
                          (cards) => countBytes(cards) == 3
                      )
                      .to.emit(pokerTable, "PokerTable__CardsUnfolded")
                      .withArgs(
                          (address) => address == accounts[2].address,
                          (cards) => countBytes(cards) == 3
                      )
                      .to.emit(pokerTable, "PokerTable__CardsUnfolded")
                      .withArgs(
                          (address) => address == accounts[3].address,
                          (cards) => countBytes(cards) == 3
                      )
                      .to.emit(pokerTable, "PokerTable__CardsUnfolded")
                      .withArgs(
                          (address) => address == accounts[4].address,
                          (cards) => countBytes(cards) == 3
                      )
                      .to.emit(pokerTable, "PokerTable__CardsUnfolded")
                      .withArgs(
                          (address) => address == accounts[5].address,
                          (cards) => countBytes(cards) == 3
                      )
              })

              it("Owner is button, Player1 is smallBlind and Player2 is bigBlind", async function () {
                  await expect(pokerTable.startGame())
                      .to.emit(pokerTable, "PokerTable__GameStarted")
                      .withArgs(
                          (button) => button == accounts[0].address,
                          (small) => small == accounts[1].address,
                          (big) => big == accounts[2].address
                      )
                  const button = await pokerTable.getCurrentButton()
                  assert.equal(button.playerAddress, accounts[0].address)
              })

              it("Small blind has the turn", async function () {
                  await pokerTable.startGame()
                  const currentPlayer = await pokerTable.getCurrentPlayer()
                  assert.equal(currentPlayer.playerAddress, accounts[1].address)
              })

              it("Small and big blind bet", async function () {
                  const val = ethers.utils.parseUnits("0.01", ERC20_BET_DECIMALS)
                  await pokerTable.startGame()
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWordsWithOverride(
                          await randomCards.s_lastRequestId(),
                          randomCards.address,
                          getRandomCards({ playersCount: 6 })
                      )
                  ).to.emit(pokerTable, "PokerTable__DeckShuffled")
                  // Small blind
                  await expect(pokerTable.connect(accounts[1]).betToPot({ value: val }))
                      .to.emit(pokerTable, "PokerTable__Bet")
                      .withArgs(
                          (sender) => sender == accounts[1].address,
                          (value) => value.toString() == val.toString()
                      )
                  assert.equal((await pokerTable.getLastBet()).toString(), val.toString())
                  // Big blind
                  await expect(pokerTable.connect(accounts[2]).betToPot({ value: val.mul(2) }))
                      .to.emit(pokerTable, "PokerTable__Bet")
                      .withArgs(
                          (sender) => sender == accounts[2].address,
                          (value) => value.toString() == (BigInt(val) * BigInt(2)).toString()
                      )
                  assert.equal((await pokerTable.getLastBet()).toString(), (BigInt(val) * BigInt(2)).toString())
              })

              it("Don't allow direct transfer to pot - Receive function", async function () {
                  const val = ethers.utils.parseUnits("0.01", ERC20_BET_DECIMALS)
                  await expect(
                      accounts[0].sendTransaction({ to: pokerTable.address, value: val })
                  ).to.be.revertedWithCustomError(pokerTable, "PokerTable__NoDirectTransferAllowed")
                  const lastBet = await pokerTable.getLastBet()
                  assert.equal(lastBet.toString(), "0")
              })

              it("Player with turn quits, pass turn to next player", async function () {
                  await pokerTable.startGame()
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWordsWithOverride(
                          await randomCards.s_lastRequestId(),
                          randomCards.address,
                          getRandomCards({ playersCount: 6 })
                      )
                  ).to.emit(pokerTable, "PokerTable__DeckShuffled")
                  const currentPlayer = await pokerTable.getCurrentPlayer()
                  assert(currentPlayer.playerAddress, accounts[1].address)
                  await expect(pokerTable.connect(accounts[1]).removePlayer())
                      .to.emit(pokerTable, "PokerTable__PlayerTurn")
                      .withArgs((address) => address == accounts[2].address)
                  const nextPlayer = await pokerTable.getCurrentPlayer()
                  assert.equal(nextPlayer.playerAddress, accounts[2].address)
              })

              it("Player previous to the one with turn quits, update turn to keep it unchanged", async function () {
                  const val = ethers.utils.parseUnits("0.01", ERC20_BET_DECIMALS)
                  await pokerTable.startGame()
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWordsWithOverride(
                          await randomCards.s_lastRequestId(),
                          randomCards.address,
                          getRandomCards({ playersCount: 6 })
                      )
                  ).to.emit(pokerTable, "PokerTable__DeckShuffled")
                  // Bet to pass turn to the 3rd player
                  for (let p = 1; p < 3; p++) await pokerTable.connect(accounts[p]).betToPot({ value: val })
                  const prevTurn = await pokerTable.getCurrentPlayer()
                  // Remove player4
                  await pokerTable.connect(accounts[4]).removePlayer()
                  const postTurn = await pokerTable.getCurrentPlayer()
                  // Assert
                  assert.equal(postTurn.address, prevTurn.address)
              })

              it("Player posterior to the one with turn quits, update turn to keep it unchanged", async function () {
                  const val = ethers.utils.parseUnits("0.01", ERC20_BET_DECIMALS)
                  await pokerTable.startGame()
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWordsWithOverride(
                          await randomCards.s_lastRequestId(),
                          randomCards.address,
                          getRandomCards({ playersCount: 6 })
                      )
                  ).to.emit(pokerTable, "PokerTable__DeckShuffled")
                  // Bet to pass turn to the 4th player
                  for (let p = 1; p < 4; p++) await pokerTable.connect(accounts[p]).betToPot({ value: val })
                  const prevTurn = await pokerTable.getCurrentPlayer()
                  // Remove player1
                  await pokerTable.connect(accounts[1]).removePlayer()
                  const postTurn = await pokerTable.getCurrentPlayer()
                  // Assert
                  assert.equal(postTurn.address, prevTurn.address)
              })

              it("3 players fold and other 2 players quit, finish game", async function () {
                  await pokerTable.startGame()
                  // Fold players
                  for (let p = 0; p < 3; p++) pokerTable.connect(accounts[p]).foldPlayer()
                  // Quit players
                  await pokerTable.connect(accounts[3]).removePlayer()
                  await expect(pokerTable.connect(accounts[4]).removePlayer()).to.emit(
                      pokerTable,
                      "PokerTable__ShowDown"
                  )
              })
          })

          describe("Check scores with hard-coded hands", function () {
              const ranks = { A: 14, K: 13, Q: 12, J: 11 }
              const suits = ["S", "H", "D", "C"]
              const cardsBinary = (cardsArr) => {
                  let binaryStringArr = Array(64).fill("0")
                  for (let card of cardsArr) {
                      let rank = card.substr(0, card.length - 1)
                      rank = ranks[rank] || parseInt(rank)
                      for (let s = 0; s < 4; s++) {
                          if (card.substr(card.length - 1) == suits[s]) {
                              const i = (14 - rank) * 4 + s
                              binaryStringArr[i] = "1"
                          }
                      }
                  }
                  return BigInt("0b" + binaryStringArr.join("")).toString()
              }

              it("Check test function cardsBinary", async function () {
                  // Royal flush
                  let cards = ["AS", "AH", "AD", "KS", "QS", "JS", "10S"]
                  let _expectedBin = 0b1110100010001000100000000000000000000000000000000000000000000000n
                  assert.equal(_expectedBin.toString(), cardsBinary(cards))
                  // 3 of a kind
                  cards = ["2S", "AH", "6C", "AS", "JH", "5D", "AC"]
                  _expectedBin = 0b1101000000000100000000000000000000010010000000001000000000000000n
                  assert.equal(_expectedBin.toString(), cardsBinary(cards))
              })

              it("Multiple calls for a determined hand cost less gas", async function () {
                  // Should cost less gas because score was already calculated
                  // 5-card hand: AC - KC - QC - JC - 10C
                  const cards = ["10C", "2H", "QC", "JC", "KC", "6D", "AC"]
                  const value = cardsBinary(cards)
                  // First call
                  let tx = await pokerTable.scoreHand(value)
                  let receipt = await tx.wait()
                  const gasUsed1 = receipt.gasUsed
                  // Second call, should cost less gas
                  tx = await pokerTable.scoreHand(value)
                  receipt = await tx.wait()
                  const gasUsed2 = receipt.gasUsed
                  assert.isBelow(gasUsed2.toNumber(), gasUsed1.div(5).toNumber())
                  // Third call, should cost same gas than 2nd
                  tx = await pokerTable.scoreHand(value)
                  receipt = await tx.wait()
                  const gasUsed3 = receipt.gasUsed
                  assert.equal(gasUsed3.toString(), gasUsed2.toString())
              })

              it("Royal Flush", async function () {
                  // 5-card hand: AC - KC - QC - JC - 10C
                  // Scores:      14 + 13 + 12 + 11 + 10 + 900 = 960
                  const cards = ["10C", "2H", "QC", "JC", "KC", "6D", "AC"]
                  const value = cardsBinary(cards)
                  await expect(pokerTable.scoreHand(value))
                      .to.emit(pokerTable, "PokerTable__HandScore")
                      .withArgs((value) => value.toString() == "960")
              })

              it("Straight Flush", async function () {
                  // 5-card hand: 10H - 9H - 8H - 7H - 6H
                  // Scores:      10  + 9  + 8  + 7  + 6 + 800 = 840
                  const cards = ["10H", "7H", "6D", "QC", "9H", "6H", "8H"]
                  const value = cardsBinary(cards)
                  await expect(pokerTable.scoreHand(value))
                      .to.emit(pokerTable, "PokerTable__HandScore")
                      .withArgs((value) => value.toString() == "840")
              })

              it("4 of a kind", async function () {
                  // 5-card hand: 7D - 7C - 7H - 7S - 6D
                  // Scores:      7  + 7  + 7  + 7  + 6 + 700 = 734
                  const cards = ["2S", "7D", "6D", "7C", "4D", "7H", "7S"]
                  const value = cardsBinary(cards)
                  await expect(pokerTable.scoreHand(value))
                      .to.emit(pokerTable, "PokerTable__HandScore")
                      .withArgs((value) => value.toString() == "734")
              })

              it("Full House", async function () {
                  // 5-card hand: 2H - 2C - 2S - 8H - 8C
                  // Scores:      2  + 2  + 2  + 8  + 8 + 600 = 622
                  const cards = ["8C", "2H", "2C", "8H", "2S", "6D", "4S"]
                  const value = cardsBinary(cards)
                  await expect(pokerTable.scoreHand(value))
                      .to.emit(pokerTable, "PokerTable__HandScore")
                      .withArgs((value) => value.toString() == "622")
              })

              it("Flush", async function () {
                  // 5-card hand: KD - JD - 6D - 5D - 4D
                  // Scores:      13 + 11 + 6  + 5  + 4 + 500 = 539
                  const cards = ["6D", "JS", "5D", "JD", "2H", "KD", "4D"]
                  const value = cardsBinary(cards)
                  await expect(pokerTable.scoreHand(value))
                      .to.emit(pokerTable, "PokerTable__HandScore")
                      .withArgs((value) => value.toString() == "539")
              })

              it("Straight", async function () {
                  // 5-card hand: 10D - 9H - 8S - 7C - 6D
                  // Scores:      10  + 9  + 8  + 7  + 6 + 400 = 440
                  const cards = ["8S", "2H", "10D", "7C", "9H", "6D", "QC"]
                  const value = cardsBinary(cards)
                  await expect(pokerTable.scoreHand(value))
                      .to.emit(pokerTable, "PokerTable__HandScore")
                      .withArgs((value) => value.toString() == "440")
              })

              it("Straight with aces low", async function () {
                  // 5-card hand: 5D - 4H - 3D - 2H - AC
                  // Scores:      5  + 4  + 3  + 2  + 1 + 400 = 415
                  const cards = ["8S", "2H", "5D", "5C", "4H", "3D", "AC"]
                  const value = cardsBinary(cards)
                  await expect(pokerTable.scoreHand(value))
                      .to.emit(pokerTable, "PokerTable__HandScore")
                      .withArgs((value) => value.toString() == "415")
              })

              it("3 of a kind", async function () {
                  // 5-card hand: AH - AS - AC - JH - 6C
                  // Scores:      14 + 14 + 14 + 11 + 6 + 300 = 359
                  const cards = ["2S", "AH", "6C", "AS", "JH", "5D", "AC"]
                  const value = cardsBinary(cards)
                  await expect(pokerTable.scoreHand(value))
                      .to.emit(pokerTable, "PokerTable__HandScore")
                      .withArgs((value) => value.toString() == "359")
              })

              it("Two pairs", async function () {
                  // 5-card hand: KH - KC - 4C - 4S - JC
                  // Scores:      13 + 13 + 4  + 4  + 11 + 200 = 245
                  const cards = ["4C", "KH", "4S", "JC", "3D", "6D", "KC"]
                  const value = cardsBinary(cards)
                  await expect(pokerTable.scoreHand(value))
                      .to.emit(pokerTable, "PokerTable__HandScore")
                      .withArgs((value) => value.toString() == "245")
              })

              it("Pair", async function () {
                  // 5-card hand: 3H - 3C - AH - 10C - 8D
                  // Scores:      3  + 3  + 14 + 10  + 8 + 100 = 138
                  const cards = ["10C", "3H", "5S", "8D", "3C", "6D", "AH"]
                  const value = cardsBinary(cards)
                  await expect(pokerTable.scoreHand(value))
                      .to.emit(pokerTable, "PokerTable__HandScore")
                      .withArgs((value) => value.toString() == "138")
              })

              it("High card", async function () {
                  // 5-card hand: AC - QS - JC - 7H - 6D
                  // Scores:      14 + 12 + 11 + 7  + 6 = 50
                  const cards = ["4H", "6D", "JC", "3D", "7H", "QS", "AC"]
                  const value = cardsBinary(cards)
                  await expect(pokerTable.scoreHand(value))
                      .to.emit(pokerTable, "PokerTable__HandScore")
                      .withArgs((value) => value.toString() == "50")
              })
          })

          describe("Finish game", function () {
              beforeEach(async function () {
                  // Register some players
                  for (let p = 1; p < 6; p++) await pokerTable.connect(accounts[p]).registerPlayer()
                  await pokerTable.startGame()
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWordsWithOverride(
                          await randomCards.s_lastRequestId(),
                          randomCards.address,
                          getRandomCards({ playersCount: 6 })
                      )
                  ).to.emit(pokerTable, "PokerTable__DeckShuffled")
              })

              it("Finish game if all players but one fold and transfers the pot", async function () {
                  const val = ethers.utils.parseUnits("250", ERC20_BET_DECIMALS)
                  const player5InitialBalance = await pokerTable.getPlayerBalance(accounts[5].address)
                  let potValue = BigInt(0)
                  // Fold players
                  for (let p = 1; p < 5; p++) {
                      pokerTable = pokerTable.connect(accounts[p])
                      await pokerTable.betToPot({ value: val })
                      potValue += BigInt(val)
                      await pokerTable.foldPlayer()
                  }
                  // Fold other player, only one left, game should finish
                  await expect(pokerTable.connect(accounts[0]).foldPlayer())
                      .to.emit(pokerTable, "PokerTable__WinnersAwarded")
                      .withArgs((addresses) => addresses[0] == accounts[5].address)
                  // All money should have been sent to the last player
                  const endPotBalance = await pokerTable.getBalance()
                  assert.equal(endPotBalance.toString(), "0")
                  const player5EndingBalance = await pokerTable.getPlayerBalance(accounts[5].address)
                  assert.equal(player5EndingBalance.toString(), player5InitialBalance.add(potValue).toString())
              })

              it("All players fold, but no bet was ever made", async function () {
                  // Fold players
                  for (let p = 0; p < 4; p++) await pokerTable.connect(accounts[p]).foldPlayer()
                  // Fold other player, only one left, game should finish
                  await expect(pokerTable.connect(accounts[4]).foldPlayer()).to.emit(
                      pokerTable,
                      "PokerTable__NoWinnersToAward"
                  )
              })

              it("Withdraw to not receivable address - Mocks", async function () {
                  const val = ethers.utils.parseUnits("250", ERC20_BET_DECIMALS)
                  // Add not payable address
                  await deployments.fixture(["mocks"])
                  const _notReceiverMock = await deployments.get("NotReceiverAddressMock")
                  const notReceiverMock = await ethers.getContractAt(_notReceiverMock.abi, _notReceiverMock.address)
                  await notReceiverMock.register(pokerTable.address)
                  // Fold players
                  for (let p = 1; p < 6; p++) {
                      pokerTable = pokerTable.connect(accounts[p])
                      await pokerTable.betToPot({ value: val })
                      await pokerTable.connect(accounts[p]).foldPlayer()
                  }
                  // Fold other player, only one left, game should finish
                  const potValue = await pokerTable.getBalance()
                  await expect(pokerTable.connect(accounts[0]).foldPlayer())
                      .to.emit(pokerTable, "PokerTable__TransferFailed")
                      .withArgs(
                          (address) => address == notReceiverMock.address,
                          (amount) => amount.toString() == potValue.toString()
                      )
              })

              it("Destroy PokerTable contract if all players quit and transfers the pot", async function () {
                  const val = ethers.utils.parseUnits("250", ERC20_BET_DECIMALS)
                  const winnerInitialBalance = await pokerTable.getPlayerBalance(accounts[0].address)
                  let potValue = BigInt(0)
                  // Bet with players accounts and quit
                  for (let p = 1; p < 5; p++) {
                      pokerTable = pokerTable.connect(accounts[p])
                      await pokerTable.betToPot({ value: val })
                      potValue += BigInt(val)
                      pokerTable.removePlayer()
                  }
                  // Two players remain, one quits
                  await pokerTable.connect(accounts[5]).betToPot({ value: val })
                  potValue += BigInt(val)
                  await expect(pokerTable.connect(accounts[5]).removePlayer())
                      .to.emit(pokerTable, "PokerTable__OnlyOnePlayerLeft")
                      .withArgs((receiver) => receiver == accounts[0].address)
                  // Contract should be destroyed
                  const contractCode = await ethers.provider.getCode(pokerTable.address)
                  assert.equal(contractCode, "0x")
                  // All money should have been sent to the last player
                  const winnerEndingBalance = await ethers.provider.getBalance(accounts[0].address)
                  assert.equal(winnerEndingBalance.toString(), winnerInitialBalance.add(potValue).toString())
              })
          })

          describe("Play an entire game", function () {
              let lastBet

              const play = ({ player, fold, remove, check, call, raise }) => {
                  player = accounts[player]
                  if (fold) return pokerTable.connect(player).foldPlayer()
                  else if (remove) return pokerTable.connect(player).removePlayer()
                  else if (check) return pokerTable.connect(player).checkTurn()
                  else if (call) return pokerTable.connect(player).betToPot({ value: lastBet })
                  else if (raise) {
                      lastBet = ethers.utils.parseUnits(raise.toString(), ERC20_BET_DECIMALS)
                      return pokerTable.connect(player).betToPot({ value: lastBet })
                  }
              }

              it("Play game, score hands and award winners", async function () {
                  /* Start game */
                  for (let i = 1; i < 5; i++) await pokerTable.connect(accounts[i]).registerPlayer()
                  await pokerTable.startGame()
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWordsWithOverride(
                          await randomCards.s_lastRequestId(),
                          randomCards.address,
                          getRandomCards({ playersCount: 5 })
                      )
                  ).to.emit(pokerTable, "PokerTable__DeckShuffled")
                  /* Pre-flop */
                  await play({ player: 1, raise: 1 }) // Small blind
                  await play({ player: 2, raise: 2 }) // Big blind
                  await play({ player: 3, call: true })
                  await play({ player: 4, call: true })
                  await play({ player: 0, raise: 3 })
                  /* Flop */
                  await play({ player: 1, call: true })
                  await play({ player: 2, fold: true })
                  await play({ player: 3, raise: 10 })
                  await play({ player: 4, call: true })
                  await play({ player: 0, raise: 15 })
                  /* Turn */
                  await play({ player: 1, call: true })
                  await play({ player: 3, call: true })
                  await play({ player: 4, call: true })
                  await play({ player: 0, raise: 20 })
                  /* River */
                  await play({ player: 1, call: true })
                  await play({ player: 3, raise: 25 })
                  await play({ player: 4, call: true })
                  /* Showdown */
                  let playersScores, awardedWinners
                  const potBalance = await pokerTable.getBalance()
                  const previousPlayersBalances = {}
                  for (let i = 0; i < 5; i++) {
                      const p = accounts[i].address
                      previousPlayersBalances[p] = await pokerTable.getPlayerBalance(p)
                  }
                  await expect(play({ player: 0, fold: true }))
                      .to.emit(pokerTable, "PokerTable__ShowDown")
                      .withArgs((players) => (playersScores = players || true))
                      .to.emit(pokerTable, "PokerTable__WinnersAwarded")
                      .withArgs((winners) => (awardedWinners = winners || true))
                  for (let player of playersScores) {
                      let winner
                      for (let w of awardedWinners) {
                          if (player.playerAddress == w) {
                              winner = true
                              const playerBalance = await pokerTable.getPlayerBalance(w)
                              assert.equal(
                                  previousPlayersBalances[w].add(potBalance).toString(),
                                  playerBalance.toString()
                              )
                          }
                      }
                      console.log(
                          `Player: ${player.playerAddress}  |  Score: ${player.score}${winner ? "  =>  Winner" : ""}`
                      )
                  }
              })
          })
      })
