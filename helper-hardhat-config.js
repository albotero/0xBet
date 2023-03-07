const { ethers } = require("hardhat")

const networkConfig = {
    31337: {
        name: "localhost",
        vrfGasLane: "0x474e34a077df58807dbe9c96d3c009b23b3c6d0cce433e59bbf5b34f823bc56c", // sepolia
        vrfRequestConfirmations: 3,
        vrfCallBackGasLimit: 20000 * 52 * 1.5, // Storing each word costs about 20.000 gas
    },
    1: {
        name: "ethereum",
        linkToken: "0x514910771AF9Ca656af840dff83E8264EcF986CA",
        vrfCoordinatorV2Address: "0x271682DEB8C4E0901D1a1550aD2e64D568E69909",
        vrfGasLane: "0x8af398995b04c28e9951adb9721ef74c74f93e6a478f39e7e0777be13527e7ef", // 200 gwei
        vrfSuscriptionId: "",
        vrfRequestConfirmations: 3,
        vrfCallBackGasLimit: 20000 * 52 * 1.5, // Storing each word costs about 20.000 gas
    },
    11155111: {
        name: "sepolia",
        linkToken: "0x779877A7B0D9E8603169DdbD7836e478b4624789",
        vrfCoordinatorV2Address: "0x8103B0A8A00be2DDC778e6e7eaa21791Cd364625",
        vrfGasLane: "0x474e34a077df58807dbe9c96d3c009b23b3c6d0cce433e59bbf5b34f823bc56c", // 30 gwei
        vrfSuscriptionId: "1",
        vrfRequestConfirmations: 3,
        vrfCallBackGasLimit: 20000 * 52 * 1.5, // Storing each word costs about 20.000 gas
    },
    5: {
        name: "goerli",
        linkToken: "0x326C977E6efc84E512bB9C30f76E30c160eD06FB",
        vrfCoordinatorV2Address: "0x2Ca8E0C643bDe4C2E08ab1fA0da3401AdAD7734D",
        vrfGasLane: "0x79d3d8832d904592c0bf9818b621522c988bb8b0c05cdc3b15aea1b6e8db0c15", // 150 gwei
        vrfSuscriptionId: "",
        vrfRequestConfirmations: 3,
        vrfCallBackGasLimit: 20000 * 52 * 1.5, // Storing each word costs about 20.000 gas
    },
    56: {
        name: "bnb",
        linkToken: "0x404460C6A5EdE2D891e8297795264fDe62ADBB75",
        vrfCoordinatorV2Address: "0xc587d9053cd1118f25F645F9E08BB98c9712A4EE",
        vrfGasLane: "0x114f3da0a805b6a67d6e9cd2ec746f7028f1b7376365af575cfea3550dd1aa04", // 200 gwei
        vrfSuscriptionId: "",
        vrfRequestConfirmations: 3,
        vrfCallBackGasLimit: 20000 * 52 * 1.5, // Storing each word costs about 20.000 gas
    },
    97: {
        name: "bnb-testnet",
        linkToken: "0x84b9B910527Ad5C03A9Ca831909E21e236EA7b06",
        vrfCoordinatorV2Address: "0x6A2AAd07396B36Fe02a22b33cf443582f682c82f",
        vrfGasLane: "0xd4bb89654db74673a187bd804519e65e3f71a52bc55f11da7601a13dcf505314", // 50 gwei
        vrfSuscriptionId: "",
        vrfRequestConfirmations: 3,
        vrfCallBackGasLimit: 20000 * 52 * 1.5, // Storing each word costs about 20.000 gas
    },
    137: {
        name: "matic",
        linkToken: "0xb0897686c545045aFc77CF20eC7A532E3120E0F1",
        vrfCoordinatorV2Address: "0xAE975071Be8F8eE67addBC1A82488F1C24858067",
        vrfGasLane: "0x6e099d640cde6de9d40ac749b4b594126b0169747122711109c9985d47751f93", // 200 gwei
        vrfSuscriptionId: "",
        vrfRequestConfirmations: 3,
        vrfCallBackGasLimit: 20000 * 52 * 1.5, // Storing each word costs about 20.000 gas
    },
    80001: {
        name: "matic-mumbai-testnet",
        linkToken: "0x326C977E6efc84E512bB9C30f76E30c160eD06FB",
        vrfCoordinatorV2Address: "0x7a1BaC17Ccc5b313516C5E16fb24f7659aA5ebed",
        vrfGasLane: "0x4b09e658ed251bcafeebbc69400383d49f344ace09b9576fe248bb02c003fe9f", // 500 gwei
        vrfSuscriptionId: "",
        vrfRequestConfirmations: 3,
        vrfCallBackGasLimit: 20000 * 52 * 1.5, // Storing each word costs about 20.000 gas
    },
}

const developmentChains = ["hardhat", "localhost"]

const ERC20_BET_DECIMALS = 8
const ERC20_BET_MAX_SUPPLY = ethers.utils.parseUnits((1e9).toString(), ERC20_BET_DECIMALS) // 1 billion tokens

module.exports = {
    networkConfig,
    developmentChains,
    ERC20_BET_MAX_SUPPLY,
    ERC20_BET_DECIMALS,
}
