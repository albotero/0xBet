const { network } = require("hardhat")
const { verify } = require("../helper-functions")
const { networkConfig, developmentChains } = require("../helper-hardhat-config")

const FUND_AMOUNT = ethers.utils.parseEther("1") // 1 Ether, or 1e18 (10^18) Wei

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()
    const chainId = network.config.chainId
    let vrfCoordinatorV2Address, vrfGasLane, vrfSuscriptionId, vrfRequestConfirmations, vrfCallBackGasLimit

    // Get args specific to the chain
    if (chainId == 31337) {
        // Use mocks with a test-net data to allow contract to be deployed
        // create VRFV2 Subscription
        const vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock")
        vrfCoordinatorV2Address = vrfCoordinatorV2Mock.address
        const transactionResponse = await vrfCoordinatorV2Mock.createSubscription()
        const transactionReceipt = await transactionResponse.wait()
        vrfSuscriptionId = transactionReceipt.events[0].args.subId
        // Fund the subscription
        // Our mock makes it so we don't actually have to worry about sending fund
        await vrfCoordinatorV2Mock.fundSubscription(vrfSuscriptionId, FUND_AMOUNT)
    } else {
        vrfCoordinatorV2Address = networkConfig[chainId]["vrfCoordinatorV2Address"]
        vrfSuscriptionId = networkConfig[chainId]["vrfSuscriptionId"]
    }
    vrfGasLane = networkConfig[chainId]["vrfGasLane"]
    vrfRequestConfirmations = networkConfig[chainId]["vrfRequestConfirmations"]
    vrfCallBackGasLimit = networkConfig[chainId]["vrfCallBackGasLimit"]

    const randomCards = await deploy("RandomCards", {
        from: deployer,
        args: [vrfCoordinatorV2Address, vrfGasLane, vrfSuscriptionId, vrfRequestConfirmations, vrfCallBackGasLimit],
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1,
    })

    // Ensure the contract is a valid consumer of the VRFCoordinatorV2Mock contract.
    if (developmentChains.includes(network.name)) {
        const vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock")
        await vrfCoordinatorV2Mock.addConsumer(vrfSuscriptionId, randomCards.address)
    }

    // Verify the deployment
    if (!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY) {
        await verify(randomCards.address, [])
    }

    log("--------------------------------------------------")
}

module.exports.tags = ["all", "randomcards"]
