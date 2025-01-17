const { ethers } = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners(); 

    console.log('Going to deploy the SimpleToken...')
    const factory = await ethers.getContractFactory('SimpleToken');
    const token = await factory.deploy();

    console.log('The contract address is', await token.getAddress());
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});