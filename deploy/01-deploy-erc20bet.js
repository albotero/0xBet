const { network } = require("hardhat")
const { developmentChains, ERC20_BET_MAX_SUPPLY, ERC20_BET_DECIMALS } = require("../helper-hardhat-config")
const { verify } = require("../helper-functions")

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()

    log("--------------------------------------------------")

    const betToken = await deploy("Erc20Bet", {
        from: deployer,
        args: [ERC20_BET_MAX_SUPPLY, ERC20_BET_DECIMALS],
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1,
    })

    if (!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY) {
        await verify(betToken.address, [ERC20_BET_MAX_SUPPLY, ERC20_BET_DECIMALS])
    }

    log("--------------------------------------------------")
}

module.exports.tags = ["all", "token"]
