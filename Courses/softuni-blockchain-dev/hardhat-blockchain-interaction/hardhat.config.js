require("@nomicfoundation/hardhat-toolbox");
require("./tasks/tokens.js");
require("hardhat-deploy");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  defaultNetwork: "localhost",
  namedAccounts: {
    deployer: {
      default: 0, // Use the first account by default as the deployer
    },
  },
  solidity: "0.8.28",
};
