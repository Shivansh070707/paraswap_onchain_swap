// test/ParaswapSwapperMulticall.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");
const paraswapService = require("../scripts/paraswapService");

// Token addresses on Arbitrum
const WETH_ADDRESS = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1";
const USDC_ADDRESS = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const WETH_WHALE = "0xC3E5607Cd4ca0D5Fe51e09B60Ed97a0Ae6F874dd";

// Paraswap addresses on Arbitrum
const PARASWAP_AUGUSTUS_SWAPPER = "0xdef171fe48cf0115b1d80b88dc8eab59176fee57";
const PARASWAP_TOKEN_TRANSFER_PROXY = "0x216B4B4Ba9F3e719726886d34a177484278Bfcae";

// Test amounts
const SWAP_AMOUNT = ethers.parseEther("1"); // 1 WETH
const MIN_DEST_AMOUNT = ethers.parseUnits("1000", 6); // Minimum 1000 USDC expected

describe("ParaswapSwapper with Multicall", function () {
	let swapper;
	let owner;
	let user;
	let weth;
	let usdc;
	let swapperAddress;

	// This test requires forking Arbitrum mainnet
	before(async function () {
		// Skip if not on a fork
		if (!process.env.FORK_URL) {
			this.skip();
		}

		// Get signers
		[owner] = await ethers.getSigners();
		user = await ethers.getImpersonatedSigner(WETH_WHALE);

		// Deploy the contract
		const ParaswapSwapper = await ethers.getContractFactory("ParaswapSwapper");
		swapper = await ParaswapSwapper.deploy();
		swapperAddress = await swapper.getAddress();

		// Get token contracts
		weth = await ethers.getContractAt("IERC20", WETH_ADDRESS);
		usdc = await ethers.getContractAt("IERC20", USDC_ADDRESS);
	});

	it("should execute a swap from WETH to USDC using multicall pattern", async function () {
		// Skip if not on a fork
		if (!process.env.FORK_URL) {
			this.skip();
		}

		// Initial balances
		const initialWethBalance = await weth.balanceOf(user.address);
		const initialUsdcBalance = await usdc.balanceOf(user.address);

		console.log(`Initial WETH balance: ${ethers.formatEther(initialWethBalance)} WETH`);
		console.log(`Initial USDC balance: ${ethers.formatUnits(initialUsdcBalance, 6)} USDC`);

		// Approve swapper to spend user's WETH
		await weth.connect(user).approve(swapperAddress, SWAP_AMOUNT);

		// Get Paraswap quote
		const priceRoute = await paraswapService.getQuote(
			WETH_ADDRESS,
			USDC_ADDRESS,
			SWAP_AMOUNT.toString(),
			swapperAddress // Use swapper contract as recipient
		);

		// Get transaction data from Paraswap
		const swapTx = await paraswapService.getSwapTransaction(priceRoute.priceRoute, swapperAddress);

		// Encode the approval call
		const approvalCallData = await swapper.encodeApproval(WETH_ADDRESS, PARASWAP_TOKEN_TRANSFER_PROXY, SWAP_AMOUNT);

		// Create multicall array
		const calls = [
			{
				target: WETH_ADDRESS,
				callData: approvalCallData,
				allowFailure: false,
			},
			{
				target: PARASWAP_AUGUSTUS_SWAPPER,
				callData: swapTx.data,
				allowFailure: false,
			},
		];

		// Execute the swap with multicall
		const tx = await swapper
			.connect(user)
			.executeSwap(WETH_ADDRESS, USDC_ADDRESS, SWAP_AMOUNT, MIN_DEST_AMOUNT, calls);

		await tx.wait();

		// Final balances
		const finalWethBalance = await weth.balanceOf(user.address);
		const finalUsdcBalance = await usdc.balanceOf(user.address);

		console.log(`Final WETH balance: ${ethers.formatEther(finalWethBalance)} WETH`);
		console.log(`Final USDC balance: ${ethers.formatUnits(finalUsdcBalance, 6)} USDC`);

		// Verify balances changed as expected
		expect(finalWethBalance).to.equal(initialWethBalance - SWAP_AMOUNT);
		expect(finalUsdcBalance).to.be.gt(initialUsdcBalance);
		expect(finalUsdcBalance).to.be.gte(initialUsdcBalance + MIN_DEST_AMOUNT);

		// Verify events were emitted
		await expect(tx).to.emit(swapper, "MultiCallExecuted").withArgs(user.address, 2, true);

		await expect(tx)
			.to.emit(swapper, "SwapExecuted")
			.withArgs(WETH_ADDRESS, USDC_ADDRESS, SWAP_AMOUNT, finalUsdcBalance - initialUsdcBalance, user.address);
	});
});
