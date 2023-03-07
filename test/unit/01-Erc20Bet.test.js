const { network, deployments, ethers } = require("hardhat")
const { expect, assert } = require("chai")
const { time } = require("@nomicfoundation/hardhat-network-helpers")
const { developmentChains, ERC20_BET_MAX_SUPPLY, ERC20_BET_DECIMALS } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Erc20Bet", function () {
          let erc20Bet, accounts

          beforeEach(async function () {
              accounts = await ethers.getSigners()
              await deployments.fixture(["token"])
              const _erc20Bet = await deployments.get("Erc20Bet")
              erc20Bet = await ethers.getContractAt(_erc20Bet.abi, _erc20Bet.address)
          })

          it("Should get max supply of 1 billion", async function () {
              const maxSupply = await erc20Bet.getMaxSupply()
              assert.equal(maxSupply.toString(), "100000000000000000")
          })

          it("Should get decimals: 8", async function () {
              const decimals = await erc20Bet.decimals()
              assert.equal(decimals.toString(), "8")
          })

          it("Only owner of the contract can mint tokens", async function () {
              const val = ethers.utils.parseUnits("0.01", ERC20_BET_DECIMALS)
              const receiver = accounts[1].address
              // Owner can mint
              const startingBalance = await erc20Bet.balanceOf(receiver)
              await expect(erc20Bet.mintTokens(receiver, val))
                  .to.emit(erc20Bet, "Erc20Bet__TokensMinted")
                  .withArgs(
                      (address) => address == receiver,
                      (value) => value.toString() == val.toString()
                  )
              const endingBalance = await erc20Bet.balanceOf(receiver)
              const totalSupply = await erc20Bet.totalSupply()
              assert.equal(endingBalance.toString(), startingBalance.add(val).toString())
              assert.equal(totalSupply.toString(), val.toString())
              // Other people can't mint
              erc20Bet = erc20Bet.connect(accounts[1])
              await expect(erc20Bet.mintTokens(receiver, val)).to.be.revertedWithCustomError(
                  erc20Bet,
                  "Erc20Bet__IsNotOwner"
              )
          })

          it("Only 1 billion tokens can be minted", async function () {
              // Mint 1 billion tokens (max)
              await erc20Bet.mintTokens(accounts[0].address, ERC20_BET_MAX_SUPPLY)
              // Mint 1 additional token
              await expect(
                  erc20Bet.mintTokens(accounts[0].address, ethers.utils.parseUnits("1", ERC20_BET_DECIMALS))
              ).to.be.revertedWithCustomError(erc20Bet, "Erc20Bet__MaxSupplyReached")
          })

          it("Only 1 billion tokens can be minted even if some tokens have been burned", async function () {
              const val = ethers.utils.parseUnits("1", ERC20_BET_DECIMALS)
              // Mint 1 billion tokens (max)
              await erc20Bet.mintTokens(accounts[1].address, ERC20_BET_MAX_SUPPLY)
              // Burn 1 token
              erc20Bet = erc20Bet.connect(accounts[1])
              await time.increase(3 * 60)
              await erc20Bet.burnTokens(val)
              // Mint 1 additional token
              erc20Bet = erc20Bet.connect(accounts[0])
              await expect(erc20Bet.mintTokens(accounts[1].address, val)).to.be.revertedWithCustomError(
                  erc20Bet,
                  "Erc20Bet__MaxSupplyReached"
              )
          })

          it("Burn tokens fails if not enough tokens in account", async function () {
              const val = ethers.utils.parseUnits("0.01", ERC20_BET_DECIMALS)
              erc20Bet = erc20Bet.connect(accounts[1])
              await expect(erc20Bet.burnTokens(val)).to.be.revertedWith("ERC20: burn amount exceeds balance")
          })

          describe("MEV Resistant ERC20", function () {
              it("Check cooldown time", async function () {
                  val = ethers.utils.parseUnits("1", ERC20_BET_DECIMALS)
                  // Mint tokens to account1
                  await erc20Bet.mintTokens(accounts[1].address, val)
                  // Account1 should be blocked to transfer away the tokens for 3 mins
                  erc20Bet = erc20Bet.connect(accounts[1])
                  await erc20Bet.approve(accounts[1].address, val)
                  await expect(erc20Bet.transfer(accounts[2].address, val)).to.be.revertedWithCustomError(
                      erc20Bet,
                      "Erc20Bet__CoolDownTimeNotPassed"
                  )
                  // Account1 should be allowed to transfer away the tokens after 3 mins
                  await time.increase(3 * 60)
                  erc20Bet = erc20Bet.connect(accounts[1])
                  await erc20Bet.approve(accounts[1].address, val)
                  await erc20Bet.transfer(accounts[2].address, val)
                  const receiverBalance = await erc20Bet.balanceOf(accounts[2].address)
                  assert.equal(receiverBalance.toString(), val.toString())
              })

              it("Cooldown Whitelist", async function () {
                  val = ethers.utils.parseUnits("1", ERC20_BET_DECIMALS)
                  // Add Account1 to whitelist and mint tokens to it
                  await erc20Bet.addCooldownWhitelist(accounts[1].address)
                  await erc20Bet.mintTokens(accounts[1].address, val)
                  // Account1 should be allowed to transfer away the tokens immediately
                  erc20Bet = erc20Bet.connect(accounts[1])
                  await erc20Bet.approve(accounts[1].address, val)
                  await erc20Bet.transfer(accounts[2].address, val)
                  // Remove Account1 from whitelist and mint more tokens to it
                  erc20Bet = erc20Bet.connect(accounts[0])
                  await erc20Bet.removeCooldownWhitelist(accounts[1].address)
                  await erc20Bet.mintTokens(accounts[1].address, val)
                  // Account1 should be blocked to transfer away the tokens for 3 mins
                  erc20Bet = erc20Bet.connect(accounts[1])
                  await erc20Bet.approve(accounts[1].address, val)
                  await expect(erc20Bet.transfer(accounts[2].address, val)).to.be.revertedWithCustomError(
                      erc20Bet,
                      "Erc20Bet__CoolDownTimeNotPassed"
                  )
                  // Account1 should be allowed to transfer away the tokens after 3 mins
                  await time.increase(3 * 60)
                  erc20Bet = erc20Bet.connect(accounts[1])
                  await erc20Bet.approve(accounts[1].address, val)
                  await erc20Bet.transfer(accounts[2].address, val)
                  const receiverBalance = await erc20Bet.balanceOf(accounts[2].address)
                  assert.equal(receiverBalance.toString(), val.mul(2).toString()) // val*2 because has received 2 transfers
              })

              it("Only the owner can update whitelist", async function () {
                  erc20Bet = erc20Bet.connect(accounts[1])
                  await expect(erc20Bet.addCooldownWhitelist(accounts[1].address)).to.be.revertedWithCustomError(
                      erc20Bet,
                      "Erc20Bet__IsNotOwner"
                  )
                  await expect(erc20Bet.removeCooldownWhitelist(accounts[1].address)).to.be.revertedWithCustomError(
                      erc20Bet,
                      "Erc20Bet__IsNotOwner"
                  )
              })
          })
      })
