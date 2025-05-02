const axios = require("axios");
const { ethers } = require("hardhat");

class ParaswapService {
	constructor() {
		this.baseUrl = "https://apiv5.paraswap.io";
	}

	/**
	 * Get price quote from Paraswap
	 * @param {string} srcToken Source token address
	 * @param {string} destToken Destination token address
	 * @param {string} srcAmount Amount of source token (in wei as string)
	 * @param {string} userAddress User address
	 * @param {number} chainId Chain ID (default: 42161 for Arbitrum)
	 * @returns {Promise<Object>} Price route data
	 */
	async getQuote(srcToken, destToken, srcAmount, userAddress, chainId = 42161) {
		let srcDecimals = await this.getTokenDecimals(srcToken);
		let destDecimals = await this.getTokenDecimals(destToken);
		console.log(srcDecimals, destDecimals, "srcDecimals, destDecimals");

		const params = {
			srcToken,
			destToken,
			srcDecimals: Number(srcDecimals),
			destDecimals: Number(destDecimals),
			amount: srcAmount,
			side: "SELL",
			network: chainId,
			userAddress,
		};

		console.log("Price quote params:", params);

		try {
			const response = await axios.get(`${this.baseUrl}/prices`, { params });
			console.log("Quote response received successfully");
			return response.data;
		} catch (error) {
			console.error("Error getting Paraswap quote:");
			if (error.response) {
				console.error("Response data:", error.response.data);
				console.error("Response status:", error.response.status);
				console.error("Response headers:", error.response.headers);
			} else if (error.request) {
				console.error("No response received:", error.request);
			} else {
				console.error("Error message:", error.message);
			}
			throw error;
		}
	}

	/**
	 * Get swap transaction data from Paraswap
	 * @param {Object} priceRoute Price route data from getQuote
	 * @param {string} userAddress User address
	 * @param {string} slippage Slippage percentage (default: '1')
	 * @param {number} chainId Chain ID (default: 42161 for Arbitrum)
	 * @returns {Promise<Object>} Transaction data
	 */
	async getSwapTransaction(priceRoute, userAddress, slippage = "1", chainId = 42161) {
		try {
			const txParams = {
				priceRoute,
				srcToken: priceRoute.srcToken,
				destToken: priceRoute.destToken,
				srcAmount: priceRoute.srcAmount,
				destAmount: priceRoute.destAmount,
				userAddress,
				deadline: Math.floor(Date.now() / 1000) + 1200,
				ignoreChecks: true,
			};

			console.log(
				"Transaction request params:",
				JSON.stringify(
					{
						...txParams,
						priceRoute: "... price route data omitted for logging ...",
					},
					null,
					2
				)
			);

			const response = await axios.post(`${this.baseUrl}/transactions/${chainId}`, txParams);
			console.log("Transaction response received successfully");
			return response.data;
		} catch (error) {
			console.error("Error getting Paraswap transaction:");
			if (error.response) {
				console.error("Response data:", error.response.data);
				console.error("Response status:", error.response.status);
			} else if (error.request) {
				console.error("No response received:", error.request);
			} else {
				console.error("Error message:", error.message);
			}
			throw error;
		}
	}

	/**
	 * Get token decimals
	 * @param {string} tokenAddress Token address
	 * @returns {Promise<number>} Token decimals
	 */
	async getTokenDecimals(tokenAddress) {
		// Handle ETH
		if (tokenAddress.toLowerCase() === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee") {
			return 18;
		}

		try {
			const tokenContract = await ethers.getContractAt("ERC20", tokenAddress);
			return await tokenContract.decimals();
		} catch (error) {
			console.error("Error getting token decimals:", error.message);
			throw error;
		}
	}
}

module.exports = new ParaswapService();
