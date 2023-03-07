const { verify } = require("../helper-functions")
const { developmentChains } = require("../helper-hardhat-config")

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()

    const bitOps = await deployments.get("BitOps")

    const pokerHands = await deploy("PokerHands", {
        from: deployer,
        libraries: { BitOps: bitOps.address },
        args: [],
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1,
    })

    if (!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY) {
        await verify(pokerHands.address, [])
    }

    log("--------------------------------------------------")
}

module.exports.tags = ["all", "pokerhands"]
