require('dotenv').config();
const ethers = require('ethers');
const { ChainId, Token, WETH, Fetcher, Route } = require('@uniswap/sdk');
const { FlashLoanReceiverArbitrage } = require('./FlashLoanReceiverArbitrage'); // Import the FlashLoanReceiverArbitrage contract ABI

// Set up provider and signer
const provider = new ethers.providers.JsonRpcProvider(process.env.ARBITRUM_RPC_URL);
const signer = new ethers.Wallet(process.env.PRIVATE_KEY).connect(provider);

// Set up addresses and tokens
const uniswap = 'Uniswap'; // Replace with the actual Uniswap DEX name
const sushiswap = 'SushiSwap'; // Replace with the actual SushiSwap DEX name
const tokenAddress = 'token-address'; // Replace with the actual token address

// Set up contract addresses
const lendingPoolAddressesProviderAddress = process.env.LENDING_POOL_ADDRESSES_PROVIDER_ADDRESS;
const flashLoanReceiverContractAddress = process.env.FLASH_LOAN_RECEIVER_CONTRACT_ADDRESS;

// Set up tokens for Uniswap and SushiSwap
const token = new Token(ChainId.MAINNET, tokenAddress, 18);

async function analyzeAndArbitrage() {
  try {
    // Fetch reserves and prices from Uniswap and SushiSwap
    const uniswapReserves = await getReserves(uniswap);
    const sushiswapReserves = await getReserves(sushiswap);
    const uniswapPrice = calculatePrice(token, uniswapReserves);
    const sushiswapPrice = calculatePrice(token, sushiswapReserves);

    // Compare prices and check for arbitrage opportunity
    if (uniswapPrice > sushiswapPrice) {
      const profit = calculateProfit(uniswapPrice, sushiswapPrice);

      console.log(`Arbitrage opportunity detected! Profit: ${profit}`);
      console.log('Executing flash loan...');

      // Execute flash loan
      const flashLoanReceiver = new ethers.Contract(
        flashLoanReceiverContractAddress,
        FlashLoanReceiverArbitrage.abi,
        signer
      );

      const transaction = await flashLoanReceiver.flashLoan(
        lendingPoolAddressesProviderAddress,
        tokenAddress,
        profit
      );
      
      console.log('Flash loan transaction hash:', transaction.hash);
    } else {
      console.log('No arbitrage opportunity detected.');
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

async function getReserves(dex) {
  const pair = await Fetcher.fetchPairData(token, WETH[ChainId.MAINNET], provider);
  const route = new Route([pair], WETH[ChainId.MAINNET]);
  
  return dex === uniswap ? pair.reserve0 : pair.reserve1;
}

function calculatePrice(token, reserves) {
  return reserves / token.decimals;
}

function calculateProfit(uniswapPrice, sushiswapPrice) {
  const amount = ethers.utils.parseEther('1'); // Amount to be borrowed in the flash loan
  const fee = amount.mul(5).div(10000); // Flash loan fee of 0.05%
  
  return amount.sub(fee).mul(uniswapPrice).div(sushiswapPrice);
}

// Execute the bot at a specified interval
setInterval(analyzeAndArbitrage, 5000); // Adjust the interval as desired

