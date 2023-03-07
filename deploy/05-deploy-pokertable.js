const { verify } = require("../helper-functions")
const { developmentChains } = require("../helper-hardhat-config")

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()

    const bitops = await deployments.get("BitOps")
    const pokerhands = await deployments.get("PokerHands")
    const randomcards = await deployments.get("RandomCards")

    const pokerTable = await deploy("PokerTable", {
        from: deployer,
        libraries: { BitOps: bitops.address },
        args: [pokerhands.address, randomcards.address],
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1,
    })

    if (!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY) {
        await verify(pokerTable.address, [])
    }

    log("--------------------------------------------------")
}

module.exports.tags = ["all", "pokertable"]
